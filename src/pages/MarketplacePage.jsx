import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { optimizeImage } from "../utils/imageCompression";
import {
  hasActiveListingSlot,
  LISTING_CONDITIONS,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_PAGE_SIZE,
  MAX_ACTIVE_LISTINGS,
  MAX_DESCRIPTION_LENGTH,
  MAX_LISTING_IMAGE_BYTES,
  MAX_LOCATION_LENGTH,
  MAX_PRICE_NGN,
  MAX_TITLE_LENGTH,
  validateListingDraft,
} from "../utils/marketplaceRules";
import {
  clearListingImage,
  createListing,
  fetchListings,
  fetchMyListings,
  isListingImageReferenced,
  markListingSold,
  removeListing,
  removeListingImage,
  submitListingReport,
  updateListing,
  uploadListingImage,
} from "../services/supabase/marketplace";
import "../styles/marketplace.css";

const EMPTY_DRAFT = {
  title: "", price: "", category: "", condition: "", description: "",
  pickup_location: "", negotiable: false,
};
const REPORT_REASONS = [
  { value: "prohibited_item", label: "Prohibited or unsafe item" },
  { value: "scam_or_suspicious", label: "Scam or suspicious listing" },
  { value: "misleading_listing", label: "Misleading listing" },
  { value: "harassment", label: "Harassment or inappropriate content" },
  { value: "other", label: "Other concern" },
];

function formatNaira(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Price unavailable";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
}

function listingImage(listing) {
  if (listing?.image_url) return listing.image_url;
  return Array.isArray(listing?.images) ? listing.images[0] || "" : "";
}

function conditionLabel(value) {
  return LISTING_CONDITIONS.find((condition) => condition.value === value)?.label || value || "Condition not set";
}

function friendlyError(error) {
  const message = String(error?.message || "");
  if (/maximum of three active listings|maximum three active listings/i.test(message)) {
    return "You already have three active listings. Mark one sold or remove one before listing another item.";
  }
  if (/row-level security|permission denied|not allowed/i.test(message)) {
    return "The database did not allow that change for this account.";
  }
  if (/marketplace_listings|schema cache|column .* does not exist/i.test(message)) {
    return "Marketplace database setup is incomplete. Apply the marketplace migrations in Supabase, then try again.";
  }
  return message || "Something went wrong. Please try again.";
}

function ListingCard({ listing, onOpen, management = false, onEdit, onMarkSold, onRemove, busy }) {
  const image = listingImage(listing);
  return (
    <article className="marketplace-card">
      <button type="button" className="marketplace-card-open" onClick={() => onOpen(listing)} aria-label={`View ${listing.title}`}>
        <div className={`marketplace-card-image${image ? " has-image" : ""}`}>
          {image ? <img src={image} alt={listing.title} loading="lazy" decoding="async" /> : <span aria-hidden="true" className="marketplace-image-placeholder">CC</span>}
          {management && listing.status === "sold" && <span className="marketplace-status-tag sold">Sold</span>}
        </div>
        <div className="marketplace-card-copy">
          <div className="marketplace-card-price">{formatNaira(listing.price)}{listing.negotiable && <span className="marketplace-negotiable">Negotiable</span>}</div>
          <h3>{listing.title}</h3>
          <div className="marketplace-card-meta"><span>{conditionLabel(listing.condition)}</span><span aria-hidden="true">·</span><span>{listing.pickup_location || "Pickup details on request"}</span></div>
        </div>
      </button>
      {management && <div className="marketplace-card-actions">
        {listing.status === "active" && <button type="button" className="marketplace-mini-button" onClick={() => onEdit(listing)} disabled={busy}>Edit</button>}
        {listing.status === "active" && <button type="button" className="marketplace-mini-button primary" onClick={() => onMarkSold(listing)} disabled={busy}>{busy ? "Saving…" : "Mark sold"}</button>}
        <button type="button" className="marketplace-mini-button danger" onClick={() => onRemove(listing)} disabled={busy}>{busy ? "Saving…" : "Remove"}</button>
      </div>}
    </article>
  );
}

export default function MarketplacePage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [view, setView] = useState("browse");
  const [returnView, setReturnView] = useState("browse");
  const [detailReturnView, setDetailReturnView] = useState("browse");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [listings, setListings] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState("");
  const [myListings, setMyListings] = useState([]);
  const [myPage, setMyPage] = useState(0);
  const [myHasMore, setMyHasMore] = useState(false);
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState("");
  const [ownStatus, setOwnStatus] = useState("active");
  const [filtersDraft, setFiltersDraft] = useState({ search: "", category: "", condition: "", minPrice: "", maxPrice: "", location: "" });
  const [filters, setFilters] = useState({ search: "", category: "", condition: "", minPrice: "", maxPrice: "", location: "" });
  const [filterError, setFilterError] = useState("");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [formErrors, setFormErrors] = useState({});
  const [policyConfirmed, setPolicyConfirmed] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("prohibited_item");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const previewUrlRef = useRef(null);
  const imageInputRef = useRef(null);
  const submitLockRef = useRef(false);
  const reportDialogRef = useRef(null);
  const reportOpenerRef = useRef(null);
  const reportSubmittingRef = useRef(false);

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  useEffect(() => () => releasePreview(), [releasePreview]);

  useEffect(() => {
    if (view !== "browse") return undefined;
    let active = true;
    setBrowseLoading(true);
    setBrowseError("");
    fetchListings(filters, 0)
      .then((rows) => {
        if (!active) return;
        setListings(rows);
        setPage(0);
        setHasMore(rows.length === MARKETPLACE_PAGE_SIZE);
      })
      .catch((error) => {
        console.error("Marketplace listings failed to load:", error);
        if (!active) return;
        setBrowseError(friendlyError(error));
        setListings([]);
        setHasMore(false);
      })
      .finally(() => { if (active) setBrowseLoading(false); });
    return () => { active = false; };
  }, [filters, view]);

  const loadMyListings = useCallback(async (status = ownStatus, requestedPage = 0, append = false) => {
    if (!currentUser?.id) return;
    setMyLoading(true);
    setMyError("");
    try {
      const rows = await fetchMyListings(currentUser.id, status, requestedPage);
      setMyListings((previous) => append ? [...previous, ...rows] : rows);
      setMyPage(requestedPage);
      setMyHasMore(rows.length === MARKETPLACE_PAGE_SIZE);
    } catch (error) {
      console.error("My marketplace listings failed to load:", error);
      setMyError(friendlyError(error));
      if (!append) setMyListings([]);
    } finally {
      setMyLoading(false);
    }
  }, [currentUser?.id, ownStatus]);

  useEffect(() => {
    if (view === "my") loadMyListings(ownStatus, 0, false);
  }, [view, ownStatus, loadMyListings]);

  useEffect(() => {
    if (!reportOpen) return undefined;
    const dialog = reportDialogRef.current;
    const opener = reportOpenerRef.current;
    const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
    const focusable = () => Array.from(dialog?.querySelectorAll(focusableSelector) || []);
    (focusable()[0] || dialog)?.focus?.({ preventScroll: true });

    function handleDialogKeyDown(event) {
      if (event.key === "Escape" && !reportSubmittingRef.current) {
        event.preventDefault();
        setReportOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog?.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      if (opener?.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    };
  }, [reportOpen]);

  const activeCount = myListings.filter((listing) => listing.status === "active").length;

  function showPreview(file) {
    releasePreview();
    if (file) {
      previewUrlRef.current = URL.createObjectURL(file);
      setImagePreview(previewUrlRef.current);
    } else {
      setImagePreview("");
    }
  }

  async function openCreateForm() {
    if (!currentUser?.id) {
      showToast("Sign in to sell an item.", "error");
      return;
    }
    try {
      const active = await fetchMyListings(currentUser.id, "active", 0);
      if (!hasActiveListingSlot(active.length)) {
        showToast("You already have three active listings. Mark one sold or remove one to free a slot.", "error");
        setOwnStatus("active");
        setView("my");
        return;
      }
      setReturnView(view === "detail" ? detailReturnView : view);
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      setFormErrors({});
      setPolicyConfirmed(false);
      setImageFile(null);
      setRemoveExistingImage(false);
      showPreview(null);
      setView("form");
    } catch (error) {
      showToast(friendlyError(error), "error");
    }
  }

  function openEditForm(listing) {
    setReturnView(view === "detail" ? detailReturnView : view);
    setEditing(listing);
    setDraft({
      title: listing.title || "",
      price: String(listing.price ?? ""),
      category: listing.category || "",
      condition: listing.condition || "",
      description: listing.description || "",
      pickup_location: listing.pickup_location || "",
      negotiable: Boolean(listing.negotiable),
    });
    setFormErrors({});
    setPolicyConfirmed(true);
    setImageFile(null);
    setRemoveExistingImage(false);
    showPreview(null);
    setImagePreview(listingImage(listing));
    setView("form");
  }

  function backFromForm() {
    releasePreview();
    setImageFile(null);
    setEditing(null);
    setFormErrors({});
    setView(returnView === "detail" && selected ? "detail" : returnView);
  }

  async function applyFilters(event) {
    event.preventDefault();
    const min = filtersDraft.minPrice === "" ? null : Number(filtersDraft.minPrice);
    const max = filtersDraft.maxPrice === "" ? null : Number(filtersDraft.maxPrice);
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) {
      setFilterError("Enter valid non-negative minimum and maximum prices.");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setFilterError("Minimum price cannot be greater than maximum price.");
      return;
    }
    setFilterError("");
    setFilters({ ...filtersDraft, minPrice: filtersDraft.minPrice.trim(), maxPrice: filtersDraft.maxPrice.trim() });
  }

  function clearFilters() {
    const empty = { search: "", category: "", condition: "", minPrice: "", maxPrice: "", location: "" };
    setFiltersDraft(empty);
    setFilters(empty);
    setFilterError("");
  }

  async function loadMoreBrowse() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const rows = await fetchListings(filters, nextPage);
      setListings((previous) => [...previous, ...rows]);
      setPage(nextPage);
      setHasMore(rows.length === MARKETPLACE_PAGE_SIZE);
    } catch (error) {
      showToast(friendlyError(error), "error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageProcessing(true);
    try {
      const optimized = await optimizeImage(file, "listing");
      if (optimized.size > MAX_LISTING_IMAGE_BYTES) throw new Error("The product image exceeds the 400 KB upload limit.");
      setImageFile(optimized);
      showPreview(optimized);
      setRemoveExistingImage(false);
      setFormErrors((previous) => ({ ...previous, image: undefined }));
    } catch (error) {
      console.error("Marketplace image processing failed:", error);
      setFormErrors((previous) => ({ ...previous, image: friendlyError(error) }));
    } finally {
      setImageProcessing(false);
    }
  }

  function clearImage() {
    setImageFile(null);
    showPreview(null);
    setRemoveExistingImage(true);
    setFormErrors((previous) => ({ ...previous, image: undefined }));
  }

  function updateDraftField(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setFormErrors((previous) => ({ ...previous, [field]: undefined, prohibited: undefined, submit: undefined }));
  }

  async function saveListing(event) {
    event.preventDefault();
    // State updates are asynchronous. The ref closes the same-tick double-submit
    // window before React has disabled the submit button on the next render.
    if (submitLockRef.current || submitting || imageProcessing) return;
    const validation = validateListingDraft(draft);
    const errors = { ...validation.errors };
    if (!policyConfirmed) errors.policy = "Confirm the physical-product and marketplace rules before saving.";
    setFormErrors(errors);
    if (!validation.valid || !policyConfirmed) return;

    submitLockRef.current = true;
    setSubmitting(true);
    let uploaded = null;
    try {
      let imageUrl = removeExistingImage ? null : listingImage(editing);
      let imagePath = removeExistingImage ? null : editing?.image_path || null;
      if (imageFile) {
        setSubmitStage("Uploading optimised product image…");
        uploaded = await uploadListingImage(imageFile, currentUser.id);
        imageUrl = uploaded.url;
        imagePath = uploaded.path;
      }
      const payload = { ...validation.value, images: imageUrl ? [imageUrl] : null, image_path: imagePath };
      setSubmitStage("Saving listing…");
      const saved = editing
        ? await updateListing(editing.id, currentUser.id, payload)
        : await createListing(currentUser.id, payload);
      uploaded = null;

      if (editing?.image_path && editing.image_path !== saved.image_path && editing.image_path.startsWith(`${currentUser.id}/`)) {
        try { await removeListingImage(editing.image_path, currentUser.id); }
        catch (cleanupError) { console.error("Listing saved but previous image cleanup failed:", cleanupError); showToast("Listing saved, but its previous image could not be removed.", "error"); }
      }

      releasePreview();
      setImageFile(null);
      setEditing(null);
      setSelected(saved);
      setOwnStatus("active");
      setView("my");
      showToast(editing ? "Listing updated." : "Your item is now listed.");
    } catch (error) {
      if (uploaded?.path) {
        let confirmedUnreferenced = false;
        try {
          confirmedUnreferenced = !(await isListingImageReferenced(uploaded.path, currentUser.id));
        } catch (verifyError) {
          console.error("Could not verify whether a failed listing save references its upload; retaining the object to avoid a broken listing:", verifyError);
        }
        if (confirmedUnreferenced) {
          try { await removeListingImage(uploaded.path, currentUser.id); }
          catch (cleanupError) { console.error("Could not clean up an unused marketplace image:", cleanupError); }
        }
      }
      console.error("Marketplace listing save failed:", error);
      const message = friendlyError(error);
      setFormErrors((previous) => ({ ...previous, submit: message }));
      showToast(message, "error");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
      setSubmitStage("");
    }
  }

  function openDetails(listing) {
    setDetailReturnView(view === "detail" ? detailReturnView : view);
    setSelected(listing);
    setReportOpen(false);
    setView("detail");
  }

  async function markSold(listing) {
    if (!window.confirm(`Mark “${listing.title}” as sold? This frees an active listing slot.`)) return;
    setBusyId(listing.id);
    try {
      const saved = await markListingSold(listing.id, currentUser.id);
      if (selected?.id === listing.id) setSelected({ ...selected, ...saved });
      showToast("Marked as sold. Your active-listing slot is free.");
      await loadMyListings(ownStatus, 0, false);
    } catch (error) {
      showToast(friendlyError(error), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function removeOwnListing(listing) {
    if (!window.confirm(`Remove “${listing.title}” from the marketplace?`)) return;
    setBusyId(listing.id);
    try {
      await removeListing(listing.id, currentUser.id);
      let cleanupFailed = false;
      if (listing.image_path && listing.image_path.startsWith(`${currentUser.id}/`)) {
        try {
          await removeListingImage(listing.image_path, currentUser.id);
          await clearListingImage(listing.id, currentUser.id);
        } catch (error) {
          cleanupFailed = true;
          console.error("Listing removed but image cleanup failed:", error);
        }
      }
      if (selected?.id === listing.id) {
        setSelected(null);
        setView("my");
      }
      showToast(cleanupFailed ? "Listing removed. Its image could not be cleaned up; the path was retained for retry." : "Listing removed from public browsing.", cleanupFailed ? "error" : "success");
      await loadMyListings(ownStatus, 0, false);
    } catch (error) {
      showToast(friendlyError(error), "error");
    } finally {
      setBusyId(null);
    }
  }

  function openReportDialog(event) {
    reportOpenerRef.current = event.currentTarget;
    setReportOpen(true);
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!selected || reportSubmitting || selected.seller_id === currentUser?.id) return;
    if (reportDetails.trim().length > 800) {
      showToast("Report details must be 800 characters or fewer.", "error");
      return;
    }
    reportSubmittingRef.current = true;
    setReportSubmitting(true);
    try {
      await submitListingReport({ listingId: selected.id, reporterId: currentUser.id, reason: reportReason, details: reportDetails });
      setReportOpen(false);
      setReportDetails("");
      showToast("Thanks. Your report has been submitted for review.");
    } catch (error) {
      showToast(friendlyError(error), "error");
    } finally {
      reportSubmittingRef.current = false;
      setReportSubmitting(false);
    }
  }

  function browseView() {
    const anyFilters = Object.values(filters).some(Boolean);
    return <>
      <header className="marketplace-header"><div><span className="eyebrow">CAMPUS MARKET</span><h1 className="display">Marketplace</h1><p className="marketplace-intro">Find useful things from students around campus.</p></div><div className="marketplace-header-actions"><button type="button" className="btn btn-ghost marketplace-my-button" onClick={() => { setOwnStatus("active"); setView("my"); }}>My listings</button><button type="button" className="btn btn-primary marketplace-sell-button" onClick={openCreateForm}>Sell an item</button></div></header>
      <form className="marketplace-filter-panel" onSubmit={applyFilters}>
        <div className="field marketplace-filter-search"><label htmlFor="market-search">Search products</label><input id="market-search" value={filtersDraft.search} maxLength={100} onChange={(event) => setFiltersDraft((previous) => ({ ...previous, search: event.target.value }))} placeholder="Search product titles" /></div>
        <div className="field"><label htmlFor="market-category">Category</label><select id="market-category" value={filtersDraft.category} onChange={(event) => setFiltersDraft((previous) => ({ ...previous, category: event.target.value }))}><option value="">All categories</option>{MARKETPLACE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
        <div className="field"><label htmlFor="market-condition">Condition</label><select id="market-condition" value={filtersDraft.condition} onChange={(event) => setFiltersDraft((previous) => ({ ...previous, condition: event.target.value }))}><option value="">Any condition</option>{LISTING_CONDITIONS.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}</select></div>
        <div className="marketplace-price-filters"><div className="field"><label htmlFor="market-min-price">Minimum price (₦)</label><input id="market-min-price" type="number" min="0" step="1" value={filtersDraft.minPrice} onChange={(event) => setFiltersDraft((previous) => ({ ...previous, minPrice: event.target.value }))} placeholder="0" /></div><div className="field"><label htmlFor="market-max-price">Maximum price (₦)</label><input id="market-max-price" type="number" min="0" step="1" value={filtersDraft.maxPrice} onChange={(event) => setFiltersDraft((previous) => ({ ...previous, maxPrice: event.target.value }))} placeholder="No limit" /></div></div>
        <div className="field"><label htmlFor="market-location">Campus / pickup location</label><input id="market-location" value={filtersDraft.location} maxLength={MAX_LOCATION_LENGTH} onChange={(event) => setFiltersDraft((previous) => ({ ...previous, location: event.target.value }))} placeholder="e.g. Main gate" /></div>
        <div className="marketplace-filter-actions"><button type="submit" className="btn btn-primary">Apply filters</button><button type="button" className="btn btn-ghost" onClick={clearFilters}>Clear</button></div>
        {filterError && <p className="marketplace-inline-error" role="alert">{filterError}</p>}
      </form>
      <div className="marketplace-results-heading"><h2 className="section-label">Latest listings</h2><span>Newest first</span></div>
      {browseLoading ? <div className="marketplace-state" role="status" aria-live="polite"><span className="marketplace-spinner" />Loading marketplace…</div>
        : browseError ? <div className="marketplace-state" role="alert"><h2>Marketplace unavailable</h2><p>{browseError}</p><button type="button" className="btn btn-primary" onClick={() => setFilters((previous) => ({ ...previous }))}>Try again</button></div>
          : listings.length === 0 ? <div className="marketplace-state"><div className="marketplace-state-mark" aria-hidden="true">CC</div><h2>{anyFilters ? "No matching listings" : "The marketplace is quiet for now"}</h2><p>{anyFilters ? "Try removing a filter or using another search term." : "Be one of the first students to list an item for sale."}</p>{anyFilters && <button type="button" className="btn btn-ghost" onClick={clearFilters}>Clear filters</button>}</div>
            : <><div className="marketplace-grid">{listings.map((listing) => <ListingCard key={listing.id} listing={listing} onOpen={openDetails} />)}</div>{hasMore && <div className="marketplace-load-more"><button type="button" className="btn btn-ghost" onClick={loadMoreBrowse} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more listings"}</button></div>}</>}
      <p className="marketplace-safety-note">Buy and sell responsibly. Prohibited items include weapons, controlled drugs, alcohol, tobacco/vapes, counterfeit or stolen goods, and adult products. Never share passwords or pay before inspecting an item.</p>
    </>;
  }

  function myListingsView() {
    return <>
      <header className="marketplace-header marketplace-my-listings-header"><div><button type="button" className="marketplace-back-link" onClick={() => { setSelected(null); setView("browse"); }}>← Marketplace</button><span className="eyebrow">SELLER SPACE</span><h1 className="display">My listings</h1><p className="marketplace-intro">Manage your items and track what has sold.</p></div><button type="button" className="btn btn-primary marketplace-sell-button" onClick={openCreateForm} disabled={ownStatus === "active" && !hasActiveListingSlot(activeCount)}>Sell an item</button></header>
      <div className="marketplace-capacity" role="status"><div><strong>{ownStatus === "active" ? `${activeCount} of ${MAX_ACTIVE_LISTINGS} active listings` : "Sold listings"}</strong><span>{ownStatus === "active" ? (hasActiveListingSlot(activeCount) ? `${MAX_ACTIVE_LISTINGS - activeCount} active slot${MAX_ACTIVE_LISTINGS - activeCount === 1 ? "" : "s"} available` : "Mark an item sold or remove one to free a slot") : "Sold items stay visible here for your records."}</span></div>{ownStatus === "active" && <div className="marketplace-capacity-track"><span style={{ width: `${Math.min(100, activeCount / MAX_ACTIVE_LISTINGS * 100)}%` }} /></div>}</div>
      <div className="marketplace-tabs" role="tablist" aria-label="Your listings"><button type="button" role="tab" aria-selected={ownStatus === "active"} className={ownStatus === "active" ? "active" : ""} onClick={() => setOwnStatus("active")}>Active</button><button type="button" role="tab" aria-selected={ownStatus === "sold"} className={ownStatus === "sold" ? "active" : ""} onClick={() => setOwnStatus("sold")}>Sold</button></div>
      {myLoading ? <div className="marketplace-state" role="status"><span className="marketplace-spinner" />Loading your listings…</div>
        : myError ? <div className="marketplace-state" role="alert"><h2>Couldn’t load your listings</h2><p>{myError}</p><button type="button" className="btn btn-primary" onClick={() => loadMyListings(ownStatus, 0, false)}>Try again</button></div>
          : myListings.length === 0 ? <div className="marketplace-state"><h2>{ownStatus === "active" ? "No active listings yet" : "Nothing sold yet"}</h2><p>{ownStatus === "active" ? "List an item students can buy from you." : "Items you mark as sold will appear here."}</p>{ownStatus === "active" && hasActiveListingSlot(activeCount) && <button type="button" className="btn btn-primary" onClick={openCreateForm}>Sell your first item</button>}</div>
            : <><div className="marketplace-grid">{myListings.map((listing) => <ListingCard key={listing.id} listing={listing} management onOpen={openDetails} onEdit={openEditForm} onMarkSold={markSold} onRemove={removeOwnListing} busy={busyId === listing.id} />)}</div>{myHasMore && <div className="marketplace-load-more"><button type="button" className="btn btn-ghost" disabled={myLoading} onClick={() => loadMyListings(ownStatus, myPage + 1, true)}>Load more sold listings</button></div>}</>}
    </>;
  }

  function formView() {
    const shownImage = imagePreview || (!removeExistingImage ? listingImage(editing) : "");
    return <>
      <header className="marketplace-header marketplace-form-header"><div><button type="button" className="marketplace-back-link" onClick={backFromForm}>← Back</button><span className="eyebrow">{editing ? "UPDATE YOUR ITEM" : "SELL ON CAMPUS"}</span><h1 className="display">{editing ? "Edit listing" : "Sell an item"}</h1><p className="marketplace-intro">Physical products only. Keep your description clear and honest.</p></div></header>
      <form className="marketplace-listing-form" onSubmit={saveListing} noValidate>
        <div className="field"><label htmlFor="listing-title">Product title *</label><input id="listing-title" value={draft.title} maxLength={MAX_TITLE_LENGTH} onChange={(event) => updateDraftField("title", event.target.value)} required aria-invalid={Boolean(formErrors.title)} aria-describedby={formErrors.title ? "listing-title-error" : undefined} placeholder="e.g. Scientific calculator" />{formErrors.title && <p id="listing-title-error" className="marketplace-field-error" role="alert">{formErrors.title}</p>}<div className="marketplace-field-count">{draft.title.length}/{MAX_TITLE_LENGTH}</div></div>
        <div className="field"><label htmlFor="listing-price">Price in Nigerian naira (₦) *</label><input id="listing-price" type="number" min="1" max={MAX_PRICE_NGN} step="1" inputMode="numeric" value={draft.price} onChange={(event) => updateDraftField("price", event.target.value)} required aria-invalid={Boolean(formErrors.price)} aria-describedby={formErrors.price ? "listing-price-error" : undefined} placeholder="e.g. 12500" />{formErrors.price && <p id="listing-price-error" className="marketplace-field-error" role="alert">{formErrors.price}</p>}<label className="marketplace-checkbox-label"><input type="checkbox" checked={draft.negotiable} onChange={(event) => updateDraftField("negotiable", event.target.checked)} /><span>Price is negotiable</span></label></div>
        <div className="marketplace-form-two-col"><div className="field"><label htmlFor="listing-category">Category *</label><select id="listing-category" value={draft.category} onChange={(event) => updateDraftField("category", event.target.value)} required aria-invalid={Boolean(formErrors.category)}><option value="">Choose category</option>{MARKETPLACE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>{formErrors.category && <p className="marketplace-field-error" role="alert">{formErrors.category}</p>}</div><div className="field"><label htmlFor="listing-condition">Condition *</label><select id="listing-condition" value={draft.condition} onChange={(event) => updateDraftField("condition", event.target.value)} required aria-invalid={Boolean(formErrors.condition)}><option value="">Choose condition</option>{LISTING_CONDITIONS.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}</select>{formErrors.condition && <p className="marketplace-field-error" role="alert">{formErrors.condition}</p>}</div></div>
        <div className="field"><label htmlFor="listing-description">Description *</label><textarea id="listing-description" value={draft.description} maxLength={MAX_DESCRIPTION_LENGTH} rows={3} onChange={(event) => updateDraftField("description", event.target.value)} required aria-invalid={Boolean(formErrors.description || formErrors.prohibited)} placeholder="Describe the item's condition and key details." />{formErrors.description && <p className="marketplace-field-error" role="alert">{formErrors.description}</p>}{formErrors.prohibited && <p className="marketplace-field-error" role="alert">{formErrors.prohibited}</p>}<div className="marketplace-field-count">{draft.description.length}/{MAX_DESCRIPTION_LENGTH}</div></div>
        <div className="field"><label htmlFor="listing-location">Campus / pickup location *</label><input id="listing-location" value={draft.pickup_location} maxLength={MAX_LOCATION_LENGTH} onChange={(event) => updateDraftField("pickup_location", event.target.value)} required aria-invalid={Boolean(formErrors.pickup_location)} placeholder="e.g. Northwest University main gate" />{formErrors.pickup_location && <p className="marketplace-field-error" role="alert">{formErrors.pickup_location}</p>}</div>
        <div className="field marketplace-image-field"><label htmlFor="listing-image">Product image <span className="marketplace-optional">(optional · one image max)</span></label><input ref={imageInputRef} id="listing-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} disabled={imageProcessing || submitting} />{imageProcessing && <p className="marketplace-progress" role="status">Optimising image…</p>}{formErrors.image && <p className="marketplace-field-error" role="alert">{formErrors.image}</p>}{shownImage && <div className="marketplace-image-preview"><img src={shownImage} alt="Preview of the product image" /><button type="button" className="marketplace-mini-button danger" onClick={clearImage} disabled={submitting}>Remove image</button></div>}</div>
        <div className="marketplace-policy-note"><strong>Before you publish</strong><p>List physical goods only. Weapons, controlled drugs, alcohol, tobacco/vapes, prescription-only medicines, counterfeit or stolen goods, and adult products are prohibited. Do not put private contact details in the description.</p><label className="marketplace-checkbox-label"><input type="checkbox" checked={policyConfirmed} onChange={(event) => { setPolicyConfirmed(event.target.checked); setFormErrors((previous) => ({ ...previous, policy: undefined })); }} aria-invalid={Boolean(formErrors.policy)} /><span>I confirm this is a physical item I am allowed to sell and the listing is accurate.</span></label>{formErrors.policy && <p className="marketplace-field-error" role="alert">{formErrors.policy}</p>}</div>
        {formErrors.submit && <p className="marketplace-field-error" role="alert">{formErrors.submit}</p>}{submitStage && <p className="marketplace-progress" role="status" aria-live="polite">{submitStage}</p>}
        <div className="marketplace-form-actions"><button type="button" className="btn btn-ghost" onClick={backFromForm} disabled={submitting}>Cancel</button><button type="submit" className="btn btn-primary" disabled={submitting || imageProcessing || !policyConfirmed}>{submitting ? "Saving…" : editing ? "Save changes" : "Publish listing"}</button></div>
      </form>
    </>;
  }

  function detailView() {
    if (!selected) return browseView();
    const image = listingImage(selected);
    const own = selected.seller_id === currentUser?.id;
    const listedDate = selected.created_at ? new Date(selected.created_at) : null;
    return <>
      <div className="marketplace-detail-top"><button type="button" className="marketplace-back-link" onClick={() => { setSelected(null); setView(detailReturnView); }}>← Back to listings</button>{own && selected.status === "active" && <button type="button" className="marketplace-mini-button" onClick={() => openEditForm(selected)}>Edit listing</button>}</div>
      <article className="marketplace-detail-layout"><div className={`marketplace-detail-image${image ? " has-image" : ""}`}>{image ? <img src={image} alt={selected.title} /> : <span className="marketplace-image-placeholder" aria-hidden="true">CC</span>}{selected.status === "sold" && <span className="marketplace-status-tag sold">Sold</span>}</div>
        <div className="marketplace-detail-copy"><span className="eyebrow">{selected.category}</span><h1 className="display">{selected.title}</h1><div className="marketplace-detail-price">{formatNaira(selected.price)}{selected.negotiable && <span className="marketplace-negotiable">Negotiable</span>}</div><div className="marketplace-detail-tags"><span>{conditionLabel(selected.condition)}</span><span>{selected.pickup_location || "Pickup details on request"}</span><span>Listed {listedDate && !Number.isNaN(listedDate.getTime()) ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(listedDate) : "recently"}</span></div><h2>Description</h2><p className="marketplace-detail-description">{selected.description}</p>
          <div className="marketplace-seller"><div className="marketplace-seller-avatar">{selected.seller?.avatar_url ? <img src={selected.seller.avatar_url} alt="" loading="lazy" /> : (selected.seller?.name || selected.seller?.username || "C").trim().charAt(0).toUpperCase()}</div><div><strong>{selected.seller?.name || "Campus Connect seller"}</strong><span>{selected.seller?.username ? `@${selected.seller.username}` : "Student seller"}</span><small>{[selected.seller?.department, selected.seller?.level ? `${selected.seller.level} level` : ""].filter(Boolean).join(" · ")}</small></div></div>
          {own ? <div className="marketplace-detail-actions">{selected.status === "active" && <button type="button" className="btn btn-primary" onClick={() => markSold(selected)} disabled={busyId === selected.id}>Mark as sold</button>}<button type="button" className="btn btn-ghost" onClick={() => removeOwnListing(selected)} disabled={busyId === selected.id}>Remove listing</button></div> : <div className="marketplace-detail-actions"><button type="button" className="btn btn-primary" onClick={() => showToast("Private messaging is not connected yet. Seller email and phone details remain private.", "error")}>Message seller <span aria-hidden="true">↗</span></button>{selected.status === "active" && <button type="button" className="marketplace-mini-button danger" onClick={openReportDialog}>Report listing</button>}<p className="marketplace-message-note">Messaging is not connected yet. Do not send payment before meeting and inspecting the item.</p></div>}
        </div>
      </article>
      {reportOpen && <div className="marketplace-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !reportSubmitting) setReportOpen(false); }}><section ref={reportDialogRef} className="marketplace-report-modal" role="dialog" aria-modal="true" aria-labelledby="market-report-title" tabIndex={-1}><button type="button" className="marketplace-modal-close" aria-label="Close report form" onClick={() => setReportOpen(false)} disabled={reportSubmitting}>×</button><h2 id="market-report-title">Report this listing</h2><p>Reports are private to the reporting account. Each account can report a listing once.</p><form onSubmit={submitReport}><div className="field"><label htmlFor="market-report-reason">Reason</label><select id="market-report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)}>{REPORT_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></div><div className="field"><label htmlFor="market-report-details">Details (optional)</label><textarea id="market-report-details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={800} rows={4} placeholder="Share helpful context without private information." /><div className="marketplace-field-count">{reportDetails.length}/800</div></div><div className="marketplace-form-actions"><button type="button" className="btn btn-ghost" onClick={() => setReportOpen(false)} disabled={reportSubmitting}>Cancel</button><button type="submit" className="btn btn-primary" disabled={reportSubmitting}>{reportSubmitting ? "Submitting…" : "Submit report"}</button></div></form></section></div>}
    </>;
  }

  return <main className="marketplace-page">
    {view === "browse" && browseView()}
    {view === "my" && myListingsView()}
    {view === "form" && formView()}
    {view === "detail" && detailView()}
  </main>;
}
