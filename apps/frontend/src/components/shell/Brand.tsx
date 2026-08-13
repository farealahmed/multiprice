import Link from 'next/link';

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="MultiPrice home">
      <span aria-hidden="true" className="brand-mark">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="brand-name">MultiPrice</span>
      <span className="brand-sub">Multi-Rate Pricing</span>
    </Link>
  );
}
