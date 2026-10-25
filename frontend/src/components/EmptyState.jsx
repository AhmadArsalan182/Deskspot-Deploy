export default function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty__icon">
          <Icon size={26} aria-hidden="true" />
        </div>
      )}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}
