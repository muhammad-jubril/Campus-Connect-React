// Falls back to the Campus Connect logo (not initials) when someone has
// no profile photo — matches the current vanilla avatarHTML() behavior.
export default function Avatar({ person, size = "sm" }) {
  const sizeClass = `avatar-circle-${size}`;
  if (person && person.avatarDataUrl) {
    return (
      <div className={`avatar-circle ${sizeClass}`}>
        <img src={person.avatarDataUrl} alt="" />
      </div>
    );
  }
  return (
    <div className={`avatar-circle ${sizeClass} avatar-default`}>
      <img className="default-avatar-logo" src="/campus-connect-logo.png" alt="Campus Connect" />
    </div>
  );
}
