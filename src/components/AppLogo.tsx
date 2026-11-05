/** A mask lets the original black SVG follow the surrounding theme color. */
export function AppLogo({ size = 25 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 bg-current"
      style={{
        width: size,
        height: size,
        mask: `url("${import.meta.env.BASE_URL}logo.svg") center / contain no-repeat`,
      }}
    />
  );
}
