import { useEffect, useRef, useState } from "react";
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

const INITIAL_DRAFT = {
  title: "",
  price: "",
  category: "",
  condition: "",
  description: "",
  pickup_location: "",
  negotiable: false,
};

const REPORT_REASONS = [
  { value: "prohibited_item", label: "Prohibited or unsafe item" },
  { value: "scam_or_suspicious", label: "Scam or suspicious listing" },
  { value: "misleading_listing", label: "Misleading description or price" },
  { value: "harassment", label: "Harassment or inappropriate content" },
  { value: "other", label: "Other concern" },
];

function formatNaira(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Price unavailable";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function conditionLabel(value) {
  return LISTING_CONDITIONS.find((condition) => condition.value === value)?.label || value || "Condition not set";
}

function dateLabel(value) {
  if (!value) return "Recently listed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently listed";
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function initialOf(value) {
  return String(value || "C").trim().charAt(0).toUpperCase() || "C";
}

function getListingImage(listing) {
  if (listing?.image_url) return listing.image_url;
  return Array.isArray(listing?.images) ? listing.images[0] || "" : "";
}

function errorMessage(error, fallback = "Something went wrong. Please try again.") {
  const message = String(error?.message || "");
  if (/maximum of three active listings|maximum three active listings/i.test(message)) {
    return "You already have three active listings. Mark one sold or remove one before listing another item.";
  }
  if (/row-level security|permission denied|not allowed/i.test(message)) {
    return "Campus Connect couldn't save this change because the account or database permissions did not allow it.";
  }
  if (/marketplace_listings|schema cache|column .* does not exist/i.test(message)) {
    return "The marketplace database setup is incomplete. Apply the marketplace migration in Supabase, then try again.";
  }
  return message || fallback;
}

function ListingCard({ listing, onOpen, management = false, onEdit, onMarkSold, onRemove, busyId }) {
  const image = getListingImage(listing);
  const busy = busyId === listing.id;
  return (
    <article className="marketplace-card">
      <button type="button" className="marketplace-card-open" onClick={() => onOpen(listing)} aria-label={`View ${listing.title}`}>
        <div className={`marketplace-card-image${image ? " has-image" : ""}`}>
          {image ? <img src={image} alt={listing.title} loading="lazy" /> : <span aria-hidden="true" className="marketplace-image-placeholder">CC</span>}
          {management && listing.status === "sold" && <span className="marketplace-status-tag sold">Sold</span>}
        </div>
        <div className="marketplace-card-copy">
          <div className="marketplace-card-price">{formatNaira(listing.price)}{listing.negotiable && <span className="marketplace-negotiable">Negotiable</span>}</div>
          <h3>{listing.title}</h3>
          <div className="marketplace-card-meta">
            <span>{conditionLabel(listing.condition)}</span><span aria-hidden="true">·</span><span>{listing.pickup_location || "Pickup details on request"}</span>
          </div>
        </div>
      </button>
      {management && (
        <div className="marketplace-card-actions">
          {listing.status === "active" && <button type="button" className="marketplace-mini-button" onClick={() => onEdit(listing)} disabled={busy}>Edit</button>}
          {listing.status === "active" && <button type="button" className="marketplace-mini-button primary" onClick={() => onMarkSold(listing)} disabled={busy}>{busy ? "Saving…" : "Mark sold"}</button>}
          <button type="button" className="marketplace-mini-button danger" onClick={() => onRemove(listing)} disabled={busy}>{busy ? "Saving…" : "Remove"}</button>
        </div>
      )}
    </article>
  );
}

export default function MarketplacePage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [view, setView] = useState("browse");
  const [selectedListing, setSelectedListing] = useState(null);
  const [detailReturnView, setDetailReturnView] = useState("browse");
  const [formReturnView, setFormReturnView] = useState("browse");
  const [editingListing, setEditingListing] = useState(null);
  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [myLoading, setMyLoading] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [myError, setMyError] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [draftFilters, setDraftFilters] = useState({ search: "", category: "", condition: "", minPrice: "", maxPrice: "", location: "" });
  const [filters, setFilters] = useState({ search: "", category: "", condition: "", minPrice: "", maxPrice: "", location: "" });
  const [filterError, setFilterError] = useState("");
  const [managementTab, setManagementTab] = useState("active");
  const [form, setForm] = useState(INITIAL_DRAFT);
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
  const previewObjectUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => () => {
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
  }, []);

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
        setBrowseError(errorMessage(error, "We couldn't load marketplace listings."));
        setListings([]);
        setHasMore(false);
      })
      .finally(() => { if (active) setBrowseLoading(false); });
    return () => { active = false; };
  }, [filters, reloadToken, view]);

  async function refreshMyListings() {
    if (!currentUser?.id) return [];
    setMyLoading(true);
    setMyError("");
    try {
      const rows = await fetchMyListings(currentUser.id);
      setMyListings(rows);
      return rows;
    } catch (error) {
      console.error("My marketplace listings failed to load:", error);
      setMyError(errorMessage(error, "We couldn't load your listings."));
      return [];
    } finally {
      setMyLoading(false);
    }
  }

  useEffect(() => {
    if (view === "my") refreshMyListings();
    // refreshMyListings reads currentUser.id and is intentionally called when
    // the visible management view or signed-in account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentUser?.id, reloadToken]);

  const activeCount = myListings.filter((listing) => listing.status === "active").length;
  const managementListings = myListings.filter((listing) => listing.status === managementTab);

  function setOwnedPreview(file) {
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    previewObjectUrlRef.current = file ? URL.createObjectURL(file) : null;
    setImagePreview(previewObjectUrlRef.current || "");
  }

  async function openCreateForm() {
    if (!currentUser?.id) {
      showToast("Sign in to sell an item.", "error");
      return;
    }
    const rows = await refreshMyListings();
    if (!hasActiveListingSlot(rows.filter((listing) => listing.status === "active").length)) {
      showToast("You already have three active listings. Mark one sold or remove one to free a slot.", "error");
      setManagementTab("active");
      setView("my");
      return;
    }
    setFormReturnView(view);
    setEditingListing(null);
    setForm(INITIAL_DRAFT);
    setFormErrors({});
    setPolicyConfirmed(false);
    setImageFile(null);
    setOwnedPreview(null);
    setRemoveExistingImage(false);
    setView("form");
  }

  function openEditForm(listing) {
    setFormReturnView(view === "detail" ? detailReturnView : view);
    setEditingListing(listing);
    setForm({
      title: listing.title || "",
      price: String(listing.price ?? ""),
      category: listing.category || "",
      condition: listing.condition || "",
      description: listing.description || "",
      pickup_location: listing.pickup_location || "",
      negotiable: Boolean(listing.negotiable),
    });
    setFormErrors({});
    setPolicyConfirmed(false);
    setImageFile(null);
    setOwnedPreview(null);
    setImagePreview(getListingImage(listing));
    setRemoveExistingImage(false);
    setView("form");
  }

  function backToBrowse() {
    setView(formReturnView);
    setImageFile(null);
    setOwnedPreview(null);
    if (formReturnView !== "detail") setSelectedListing(null);
    setEditingListing(null);
    setFormErrors({});
    setSubmitting(false);
    setSubmitStage("");
  }

  async function handleFilterSubmit(event) {
    event.preventDefault();
    const min = draftFilters.minPrice === "" ? null : Number(draftFilters.minPrice);
    const max = draftFilters.maxPrice === "" ? null : Number(draftFilters.maxPrice);
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) {
      setFilterError("Enter valid non-negative minimum and maximum prices.");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setFilterError("Minimum price cannot be greater than maximum price.");
      return;
    }
    setFilterError("");
    setFilters({ ...draftFilters, minPrice: draftFilters.minPrice.trim(), maxPrice: draftFilters.maxPrice.trim() });
  }

  async function handleLoadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const rows = await fetchListings(filters, nextPage);
      setListings((current) => [...current, ...rows]);
      setPage(nextPage);
      setHasMore(rows.length === MARKETPLACE_PAGE_SIZE);
    } catch (error) {
      showToast(errorMessage(error, "Couldn't load more listings."), "error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleImageChange(event) {
    const originalFile = event.target.files?.[0];
    event.target.value = "";
    if (!originalFile) return;
    setImageProcessing(true);
    try {
      const optimized = await optimizeImage(originalFile, "listing");
      if (optimized.size > MAX_LISTING_IMAGE_BYTES) throw new Error("The product image exceeds the 400 KB upload limit.");
      setImageFile(optimized);
      setOwnedPreview(optimized);
      setRemoveExistingImage(false);
      setFormErrors((current) => ({ ...current, image: undefined }));
    } catch (error) {
      console.error("Marketplace image processing failed:", error);
      showToast(error?.message || "Couldn't process that image. Choose a JPEG, PNG, or WebP image.", "error");
    } finally {
      setImageProcessing(false);
    }
  }

  function clearImage() {
    setImageFile(null);
    setOwnedPreview(null);
    setRemoveExistingImage(true);
  }

  function updateFormField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined, prohibited: undefined }));
  }

  async function handleSaveListing(event) {
    event.preventDefault();
    if (submitting || imageProcessing) return;
    const validation = validateListingDraft(form);
    const nextErrors = {
      ...validation.errors,
      ...(!policyConfirmed ? { policy: "Confirm the physical-product and marketplace rules before saving." } : {}),
    };
    setFormErrors(nextErrors);
    if (!validation.valid || !policyConfirmed) return;

    setSubmitting(true);
    setSubmitStage("Preparing listing…");
    let newlyUploaded = null;
    try {
      let imageUrl = removeExistingImage ? null : getListingImage(editingListing);
      let imagePath = removeExistingImage ? null : editingListing?.image_path || null;

      if (imageFile) {
        setSubmitStage("Uploading compressed product image…");
        newlyUploaded = await uploadListingImage(imageFile, currentUser.id);
        imageUrl = newlyUploaded.url;
        imagePath = newlyUploaded.path;
      }

      const payload = {
        ...validation.value,
        images: imageUrl ? [imageUrl] : null,
        image_path: imagePath,
      };

      setSubmitStage("Saving listing…");
      let saved;
      let cleanupWarning = false;
      if (editingListing) {
        saved = await updateListing(editingListing.id, currentUser.id, payload);
      } else {
        saved = await createListing(currentUser.id, payload);
      }
      newlyUploaded = null;

      const oldPath = editingListing?.image_path;
      if (oldPath && oldPath !== saved.image_path && oldPath.startsWith(`${currentUser.id}/`)) {
        try { await removeListingImage(oldPath, currentUser.id); }
        catch (cleanupError) { cleanupWarning = true; console.error("Listing saved but the replaced product image could not be removed:", cleanupError); }
      }

      showToast(cleanupWarning ? "Your listing was saved, but the previous image could not be deleted." : editingListing ? "Listing updated." : "Your item is now listed.", cleanupWarning ? "error" : "success");
      setReloadToken((token) => token + 1);
      setEditingListing(null);
      setImageFile(null);
      setOwnedPreview(null);
      setView("my");
      setManagementTab("active");
    } catch (error) {
      if (newlyUploaded?.path) {
        // A network failure can happen after Supabase committed the row. Only
        // delete the object after confirming no saved listing references it.
        let confirmedUnreferenced = false;
        try {
          const referenced = await isListingImageReferenced(newlyUploaded.path, currentUser.id, editingListing?.id || null);
          confirmedUnreferenced = !referenced;
        } catch (verificationError) {
          console.error("Couldn't verify whether a failed listing save references its image; retaining the upload to avoid a broken listing:", verificationError);
        }
        if (confirmedUnreferenced) {
          try { await removeListingImage(newlyUploaded.path, currentUser.id); }
          catch (cleanupError) { console.error("Failed to clean up an unused marketplace image:", cleanupError); }
        }
      }
      console.error("Marketplace listing save failed:", error);
      showToast(errorMessage(error, "Couldn't save this listing. Check your connection and try again."), "error");
      setFormErrors((current) => ({ ...current, submit: errorMessage(error, "Couldn't save this listing.") }));
    } finally {
      setSubmitting(false);
      setSubmitStage("");
    }
  }

  async function handleMarkSold(listing) {
    if (!window.confirm(`Mark “${listing.title}” as sold? This will free one active-listing slot.`)) return;
    setBusyId(listing.id);
    try {
      await markListingSold(listing.id, currentUser.id);
      showToast("Marked as sold. Your active-listing slot is free.");
      setReloadToken((token) => token + 1);
      if (selectedListing?.id === listing.id) setSelectedListing({ ...listing, status: "sold" });
    } catch (error) {
      showToast(errorMessage(error, "Couldn't mark this listing as sold."), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemoveListing(listing) {
    if (!window.confirm(`Remove “${listing.title}” from the marketplace? This keeps the record in your listing history.`)) return;
    setBusyId(listing.id);
    try {
      await removeListing(listing.id, currentUser.id);
      let cleanupFailed = false;
      if (listing.image_path && listing.image_path.startsWith(`${currentUser.id}/`)) {
        try {
          await removeListingImage(listing.image_path, currentUser.id);
          await clearListingImage(listing.id, currentUser.id);
        } catch (cleanupError) {
          cleanupFailed = true;
          console.error("Listing removed but product image cleanup failed:", cleanupError);
        }
      }
      if (selectedListing?.id === listing.id) { setSelectedListing(null); setView(detailReturnView); }
      showToast(cleanupFailed ? "The listing was removed, but its image could not be cleaned up. The path remains recorded for retry." : "Listing removed from marketplace.", cleanupFailed ? "error" : "success");
      setReloadToken((token) => token + 1);
    } catch (error) {
      showToast(errorMessage(error, "Couldn't remove this listing."), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReportSubmit(event) {
    event.preventDefault();
    if (!selectedListing || reportSubmitting) return;
    if (selectedListing.seller_id === currentUser?.id) {
      showToast("You can't report your own listing.", "error");
      return;
    }
    if (reportDetails.trim().length > 800) {
      showToast("Report details must be 800 characters or fewer.", "error");
      return;
    }
    setReportSubmitting(true);
    try {
      await submitListingReport({ listingId: selectedListing.id, reporterId: currentUser.id, reason: reportReason, details: reportDetails });
      setReportOpen(false);
      setReportDetails("");
      showToast("Thanks. Your report has been submitted for review.");
    } catch (error) {
      showToast(errorMessage(error, "Couldn't submit the report."), "error");
    } finally {
      setReportSubmitting(false);
    }
  }

  function openDetails(listing) {
    setDetailReturnView(view === "detail" ? detailReturnView : view);
    setSelectedListing(listing);
    setReportOpen(false);
    setView("detail");
  }

  function renderBrowse() {
    return (
      <>
        <header className="marketplace-header">
          <div>
            <span className="eyebrow">CAMPUS MARKET</span>
            <h1 className="display">Marketplace</h1>
            <p className="marketplace-intro">Find useful things from students around campus.</p>
          </div>
          <div className="marketplace-header-actions">
            <button type="button" className="btn btn-ghost marketplace-my-button" onClick={() => setView("my")}>My listings</button>
            <button type="button" className="btn btn-primary marketplace-sell-button" onClick={openCreateForm}>Sell an item</button>
          </div>
        </header>

        <form className="marketplace-filter-panel" onSubmit={handleFilterSubmit}>
          <div className="marketplace-filter-search field">
            <label htmlFor="market-search">Search products</label>
            <input id="market-search" value={draftFilters.search} onChange={(event) => setDraftFilters((f) => ({ ...f, search: event.target.value }))} placeholder="Search by product title" maxLength={100} />
          </div>
          <div className="field">
            <label htmlFor="market-category">Category</label>
            <select id="market-category" value={draftFilters.category} onChange={(event) => setDraftFilters((f) => ({ ...f, category: event.target.value }))}>
              <option value="">All categories</option>
              {MARKETPLACE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="market-condition">Condition</label>
            <select id="market-condition" value={draftFilters.condition} onChange={(event) => setDraftFilters((f) => ({ ...f, condition: event.target.value }))}>
              <option value="">Any condition</option>
              {LISTING_CONDITIONS.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}
            </select>
          </div>
          <div className="marketplace-price-filters">
            <div className="field"><label htmlFor="market-min-price">Min price (₦)</label><input id="market-min-price" type="number" min="0" step="1" value={draftFilters.minPrice} onChange={(event) => setDraftFilters((f) => ({ ...f, minPrice: event.target.value }))} placeholder="0" /></div>
            <div className="field"><label htmlFor="market-max-price">Max price (₦)</label><input id="market-max-price" type="number" min="0" step="1" value={draftFilters.maxPrice} onChange={(event) => setDraftFilters((f) => ({ ...f, maxPrice: event.target.value }))} placeholder="No limit" /></div>
          </div>
          <div className="field">
            <label htmlFor="market-location">Campus / pickup location</label>
            <input id="market-location" value={draftFilters.location} maxLength={MAX_LOCATION_LENGTH} onChange={(event) => setDraftFilters((f) => ({ ...f, location: event.target.value }))} placeholder="e.g. Main gate" />
          </div>
          <div className="marketplace-filter-actions">
            <button className="btn btn-primary" type="submit">Apply filters</button>
            <button className="btn btn-ghost" type="button" onClick={() => {
              const clean = { search: "", category: "", condition: "", minPrice: "", maxPrice: "", location: "" };
              setDraftFilters(clean); setFilters(clean); setFilterError("");
            }}>Clear</button>
          </div>
          {filterError && <p className="marketplace-inline-error" role="alert">{filterError}</p>}
        </form>

        <div className="marketplace-results-heading">
          <h2 className="section-label">Latest listings</h2>
          <span>Newest first</span>
        </div>
        {browseLoading ? (
          <div className="marketplace-state" role="status" aria-live="polite"><span className="marketplace-spinner" />Loading marketplace…</div>
        ) : browseError ? (
          <div className="marketplace-state" role="alert"><h2>Marketplace unavailable</h2><p>{browseError}</p><button type="button" className="btn btn-primary" onClick={() => setReloadToken((token) => token + 1)}>Try again</button></div>
        ) : listings.length === 0 ? (
          <div className="marketplace-state"><div className="marketplace-state-mark" aria-hidden="true">CC</div><h2>{Object.values(filters).some(Boolean) ? "No matching listings" : "The marketplace is quiet for now"}</h2><p>{Object.values(filters).some(Boolean) ? "Try removing a filter or using another search term." : "Be one of the first students to list an item for sale."}</p><div className="marketplace-state-actions"><button type="button" className="btn btn-primary" onClick={openCreateForm}>Sell an item</button>{Object.values(filters).some(Boolean) && <button type="button" className="btn btn-ghost" onClick={() => { const clean = { search: "", category: "", condition: "", minPrice: "", maxPrice: "", location: "" }; setDraftFilters(clean); setFilters(clean); }}>Clear filters</button>}</div></div>
        ) : (
          <>
            <div className="marketplace-grid">{listings.map((listing) => <ListingCard key={listing.id} listing={listing} onOpen={openDetails} />)}</div>
            {hasMore && <div className="marketplace-load-more"><button type="button" className="btn btn-ghost" disabled={loadingMore} onClick={handleLoadMore}>{loadingMore ? "Loading…" : "Load more listings"}</button></div>}
          </>
        )}
        <p className="marketplace-safety-note">Buy and sell responsibly. Prohibited items include weapons, controlled drugs, alcohol, tobacco/vapes, counterfeit or stolen goods, and adult products. Never share passwords or send money to an unverified seller.</p>
      </>
    );
  }

  function renderMyListings() {
    return (
      <>
        <header className="marketplace-header marketplace-my-listings-header">
          <div><button type="button" className="marketplace-back-link" onClick={backToBrowse}>← Marketplace</button><span className="eyebrow">SELLER SPACE</span><h1 className="display">My listings</h1><p className="marketplace-intro">Manage your items and track what has sold.</p></div>
          <button type="button" className="btn btn-primary marketplace-sell-button" onClick={openCreateForm} disabled={!hasActiveListingSlot(activeCount)}>Sell an item</button>
        </header>
        <div className="marketplace-capacity" role="status"><div><strong>{activeCount} of {MAX_ACTIVE_LISTINGS} active listings</strong><span>{hasActiveListingSlot(activeCount) ? `${MAX_ACTIVE_LISTINGS - activeCount} active slot${MAX_ACTIVE_LISTINGS - activeCount === 1 ? "" : "s"} available` : "Mark an item sold or remove one to free a slot"}</span></div><div className="marketplace-capacity-track"><span style={{ width: `${Math.min(100, activeCount / MAX_ACTIVE_LISTINGS * 100)}%` }} /></div></div>
        <div className="marketplace-tabs" role="tablist" aria-label="Your listings">
          <button type="button" role="tab" aria-selected={managementTab === "active"} className={managementTab === "active" ? "active" : ""} onClick={() => setManagementTab("active")}>Active ({myListings.filter((item) => item.status === "active").length})</button>
          <button type="button" role="tab" aria-selected={managementTab === "sold"} className={managementTab === "sold" ? "active" : ""} onClick={() => setManagementTab("sold")}>Sold ({myListings.filter((item) => item.status === "sold").length})</button>
        </div>
        {myLoading ? <div className="marketplace-state" role="status"><span className="marketplace-spinner" />Loading your listings…</div>
          : myError ? <div className="marketplace-state" role="alert"><h2>Couldn't load your listings</h2><p>{myError}</p><button type="button" className="btn btn-primary" onClick={refreshMyListings}>Try again</button></div>
            : managementListings.length === 0 ? <div className="marketplace-state"><h2>{managementTab === "active" ? "No active listings yet" : "Nothing sold yet"}</h2><p>{managementTab === "active" ? "List an item students can buy from you." : "Items you mark as sold will appear here."}</p>{managementTab === "active" && hasActiveListingSlot(activeCount) && <button type="button" className="btn btn-primary" onClick={openCreateForm}>Sell your first item</button>}</div>
              : <div className="marketplace-grid">{managementListings.map((listing) => <ListingCard key={listing.id} listing={listing} management onOpen={openDetails} onEdit={openEditForm} onMarkSold={handleMarkSold} onRemove={handleRemoveListing} busyId={busyId} />)}</div>}
      </>
    );
  }

  function renderForm() {
    const imageToShow = imagePreview || (!removeExistingImage ? getListingImage(editingListing) : "");
    return (
      <>
        <header className="marketplace-header marketplace-form-header"><div><button type="button" className="marketplace-back-link" onClick={backToBrowse}>← Back to marketplace</button><span className="eyebrow">{editingListing ? "UPDATE YOUR ITEM" : "SELL ON CAMPUS"}</span><h1 className="display">{editingListing ? "Edit listing" : "Sell an item"}</h1><p className="marketplace-intro">Physical products only. Keep your description clear and honest.</p></div></header>
        <form className="marketplace-listing-form" onSubmit={handleSaveListing} noValidate>
          <div className="field"><label htmlFor="listing-title">Product title <span aria-hidden="true">*</span></label><input id="listing-title" type="text" value={form.title} maxLength={MAX_TITLE_LENGTH} onChange={(event) => updateFormField("title", event.target.value)} required aria-invalid={Boolean(formErrors.title)} aria-describedby={formErrors.title ? "listing-title-error" : undefined} placeholder="e.g. Scientific calculator" />{formErrors.title && <p id="listing-title-error" className="marketplace-field-error" role="alert">{formErrors.title}</p>}<div className="marketplace-field-count">{form.title.length}/{MAX_TITLE_LENGTH}</div></div>
          <div className="field"><label htmlFor="listing-price">Price in Nigerian naira (₦) <span aria-hidden="true">*</span></label><input id="listing-price" type="number" min="1" max={MAX_PRICE_NGN} step="1" inputMode="numeric" value={form.price} onChange={(event) => updateFormField("price", event.target.value)} required aria-invalid={Boolean(formErrors.price)} aria-describedby={formErrors.price ? "listing-price-error" : undefined} placeholder="e.g. 12500" />{formErrors.price && <p id="listing-price-error" className="marketplace-field-error" role="alert">{formErrors.price}</p>}<label className="marketplace-checkbox-label"><input type="checkbox" checked={form.negotiable} onChange={(event) => updateFormField("negotiable", event.target.checked)} /><span>Price is negotiable</span></label></div>
          <div className="marketplace-form-two-col"><div className="field"><label htmlFor="listing-category">Category <span aria-hidden="true">*</span></label><select id="listing-category" value={form.category} onChange={(event) => updateFormField("category", event.target.value)} required aria-invalid={Boolean(formErrors.category)}><option value="">Choose category</option>{MARKETPLACE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>{formErrors.category && <p className="marketplace-field-error" role="alert">{formErrors.category}</p>}</div><div className="field"><label htmlFor="listing-condition">Condition <span aria-hidden="true">*</span></label><select id="listing-condition" value={form.condition} onChange={(event) => updateFormField("condition", event.target.value)} required aria-invalid={Boolean(formErrors.condition)}><option value="">Choose condition</option>{LISTING_CONDITIONS.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}</select>{formErrors.condition && <p className="marketplace-field-error" role="alert">{formErrors.condition}</p>}</div></div>
          <div className="field"><label htmlFor="listing-description">Description <span aria-hidden="true">*</span></label><textarea id="listing-description" value={form.description} maxLength={MAX_DESCRIPTION_LENGTH} rows={3} onChange={(event) => updateFormField("description", event.target.value)} required aria-invalid={Boolean(formErrors.description || formErrors.prohibited)} placeholder="Describe the item's condition, key details and anything a buyer should know." />{formErrors.description && <p className="marketplace-field-error" role="alert">{formErrors.description}</p>}{formErrors.prohibited && <p className="marketplace-field-error" role="alert">{formErrors.prohibited}</p>}<div className="marketplace-field-count">{form.description.length}/{MAX_DESCRIPTION_LENGTH}</div></div>
          <div className="field"><label htmlFor="listing-location">Campus / pickup location <span aria-hidden="true">*</span></label><input id="listing-location" type="text" value={form.pickup_location} maxLength={MAX_LOCATION_LENGTH} onChange={(event) => updateFormField("pickup_location", event.target.value)} required aria-invalid={Boolean(formErrors.pickup_location)} placeholder="e.g. Northwest University main gate" />{formErrors.pickup_location && <p className="marketplace-field-error" role="alert">{formErrors.pickup_location}</p>}</div>
          <div className="field marketplace-image-field"><label htmlFor="listing-image">Product image <span className="marketplace-optional">(optional · one image max)</span></label><input ref={fileInputRef} id="listing-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} disabled={imageProcessing || submitting} />{imageProcessing && <p className="marketplace-progress" role="status">Optimising image…</p>}{imageToShow && <div className="marketplace-image-preview"><img src={imageToShow} alt="Preview of the product image" /><button type="button" className="marketplace-mini-button danger" onClick={clearImage} disabled={submitting}>Remove image</button></div>}</div>
          <div className="marketplace-policy-note"><strong>Before you publish</strong><p>List physical goods only. Weapons, controlled drugs, alcohol, tobacco/vapes, prescription-only medicines, counterfeit or stolen goods, and adult products are prohibited. Don't post private contact details in the description.</p><label className="marketplace-checkbox-label"><input type="checkbox" checked={policyConfirmed} onChange={(event) => { setPolicyConfirmed(event.target.checked); setFormErrors((current) => ({ ...current, policy: undefined })); }} aria-invalid={Boolean(formErrors.policy)} aria-describedby={formErrors.policy ? "listing-policy-error" : undefined} /> <span>I confirm this is a physical item I am allowed to sell, and the listing is accurate.</span></label>{formErrors.policy && <p id="listing-policy-error" className="marketplace-field-error" role="alert">{formErrors.policy}</p>}</div>
          {formErrors.submit && <p className="marketplace-field-error" role="alert">{formErrors.submit}</p>}
          {submitStage && <p className="marketplace-progress" role="status" aria-live="polite">{submitStage}</p>}
          <div className="marketplace-form-actions"><button type="button" className="btn btn-ghost" onClick={backToBrowse} disabled={submitting}>Cancel</button><button type="submit" className="btn btn-primary" disabled={submitting || imageProcessing || !policyConfirmed}>{submitting ? "Saving…" : editingListing ? "Save changes" : "Publish listing"}</button></div>
        </form>
      </>
    );
  }

  function renderDetails() {
    if (!selectedListing) return renderBrowse();
    const image = getListingImage(selectedListing);
    const ownListing = selectedListing.seller_id === currentUser?.id;
    return (
      <>
        <div className="marketplace-detail-top"><button type="button" className="marketplace-back-link" onClick={() => { setSelectedListing(null); setView(detailReturnView); }}>← Back</button>{ownListing && <button type="button" className="marketplace-mini-button" onClick={() => openEditForm(selectedListing)} disabled={selectedListing.status !== "active"}>Edit listing</button>}</div>
        <article className="marketplace-detail-layout">
          <div className={`marketplace-detail-image${image ? " has-image" : ""}`}>{image ? <img src={image} alt={selectedListing.title} /> : <span className="marketplace-image-placeholder" aria-hidden="true">CC</span>}{selectedListing.status === "sold" && <span className="marketplace-status-tag sold">Sold</span>}</div>
          <div className="marketplace-detail-copy"><span className="eyebrow">{selectedListing.category}</span><h1 className="display">{selectedListing.title}</h1><div className="marketplace-detail-price">{formatNaira(selectedListing.price)}{selectedListing.negotiable && <span className="marketplace-negotiable">Negotiable</span>}</div><div className="marketplace-detail-tags"><span>{conditionLabel(selectedListing.condition)}</span><span>{selectedListing.pickup_location || "Pickup details on request"}</span><span>Listed {dateLabel(selectedListing.created_at)}</span></div><h2>Description</h2><p className="marketplace-detail-description">{selectedListing.description}</p>
            <div className="marketplace-seller"><div className="marketplace-seller-avatar">{selectedListing.seller?.avatar_url ? <img src={selectedListing.seller.avatar_url} alt="" loading="lazy" /> : initialOf(selectedListing.seller?.name || selectedListing.seller?.username)}</div><div><strong>{selectedListing.seller?.name || "Campus Connect seller"}</strong><span>{selectedListing.seller?.username ? `@${selectedListing.seller.username}` : "Student seller"}</span><small>{[selectedListing.seller?.department, selectedListing.seller?.level ? `${selectedListing.seller.level} level` : ""].filter(Boolean).join(" · ")}</small></div></div>
            {ownListing ? <div className="marketplace-detail-actions">{selectedListing.status === "active" && <button type="button" className="btn btn-primary" onClick={() => handleMarkSold(selectedListing)} disabled={busyId === selectedListing.id}>Mark as sold</button>}<button type="button" className="btn btn-ghost" onClick={() => handleRemoveListing(selectedListing)} disabled={busyId === selectedListing.id}>Remove listing</button></div> : <div className="marketplace-detail-actions"><button type="button" className="btn btn-primary" onClick={() => showToast("Private messaging isn't available yet. Seller email and phone details remain private.")}>Message seller <span aria-hidden="true">↗</span></button><button type="button" className="marketplace-mini-button danger" onClick={() => setReportOpen(true)}>Report listing</button><p className="marketplace-message-note">Messaging is not connected yet. Don't share passwords or send payment before meeting and inspecting the item.</p></div>}
          </div>
        </article>
        {reportOpen && <div className="marketplace-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportOpen(false); }}><section className="marketplace-report-modal" role="dialog" aria-modal="true" aria-labelledby="market-report-title"><button type="button" className="marketplace-modal-close" aria-label="Close report form" onClick={() => setReportOpen(false)}>×</button><h2 id="market-report-title">Report this listing</h2><p>Tell us what's wrong. Reports are private to the reporting account and are limited to one report per account per listing.</p><form onSubmit={handleReportSubmit}><div className="field"><label htmlFor="market-report-reason">Reason</label><select id="market-report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)}>{REPORT_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></div><div className="field"><label htmlFor="market-report-details">Details (optional)</label><textarea id="market-report-details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={800} rows={4} placeholder="Share helpful context without including private information." /><div className="marketplace-field-count">{reportDetails.length}/800</div></div><div className="marketplace-form-actions"><button type="button" className="btn btn-ghost" onClick={() => setReportOpen(false)} disabled={reportSubmitting}>Cancel</button><button type="submit" className="btn btn-primary" disabled={reportSubmitting}>{reportSubmitting ? "Submitting…" : "Submit report"}</button></div></form></section></div>}
      </>
    );
  }

  return (
    <main className="marketplace-page">
      {view === "browse" && renderBrowse()}
      {view === "my" && renderMyListings()}
      {view === "form" && renderForm()}
      {view === "detail" && renderDetails()}
    </main>
  );
}
