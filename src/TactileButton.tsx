import type {ButtonHTMLAttributes} from 'react';
import './tactile-button.css';
// Raised cap/base and glare treatment adapted from RailSetu-v2's TactileGlareLink.
export function TactileButton({className='',children,disabled,...props}:ButtonHTMLAttributes<HTMLButtonElement>){
 return <span className={`sense-tactile-wrap ${disabled?'is-disabled':''}`}><span className="sense-tactile-base" aria-hidden="true"/><button type="button" {...props} disabled={disabled} className={`sense-tactile-cap ${className}`}>{children}</button></span>;
}
