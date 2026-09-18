import { PlatformLogo } from './PlatformLogo';

export function BrandMark({
  name: _name,
  logoUrl,
  className = '',
  fallbackClassName = 'logo-icon',
}: {
  name: string;
  logoUrl?: string;
  className?: string;
  fallbackClassName?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={`brand-logo-image ${className}`.trim()}
      />
    );
  }

  return <PlatformLogo className={`${fallbackClassName} mark-only ${className}`.trim()} decorative />;
}
