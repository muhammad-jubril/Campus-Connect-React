// The old global post-auth header was replaced by the exact per-screen
// headers from the vanilla shell. Kept as a harmless compatibility export
// so stale imports cannot reintroduce a second header.
export default function Header() {
  return null;
}
