import { Link } from 'react-router-dom';

export default function BrandLogo({ to = '/', inverse = false, label = 'Quantara home', className = '' }) {
  return <Link to={to} className={`landing-brand${inverse ? ' landing-brand-inverse' : ''}${className ? ` ${className}` : ''}`} aria-label={label}>
    <span className="landing-brand-mark" aria-hidden="true">Q</span>
    <span>Quantara</span>
  </Link>;
}
