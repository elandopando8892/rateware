type RoutePlaceholderProps = {
  title: string;
  message?: string;
};

export function RoutePlaceholder({
  title,
  message = 'Disponible en una fase posterior',
}: RoutePlaceholderProps) {
  return (
    <section className="route-placeholder">
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}
