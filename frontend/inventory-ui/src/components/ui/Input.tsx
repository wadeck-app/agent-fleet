import { InputHTMLAttributes, forwardRef } from 'react';
import styles from './Input.module.scss';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, fullWidth = false, className, ...props }, ref) => {
    const wrapperClasses = [
      styles.wrapper,
      fullWidth && styles['wrapper--full-width'],
    ]
      .filter(Boolean)
      .join(' ');

    const inputClasses = [
      styles.input,
      error && styles['input--error'],
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapperClasses}>
        {label && (
          <label className={styles.label} htmlFor={props.id}>
            {label}
          </label>
        )}
        <input ref={ref} className={inputClasses} {...props} />
        {error && <span className={styles.error}>{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
