import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { CheckIcon } from './icons/CheckIcon';
import styles from './Checkbox.module.scss';

export interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export const Checkbox = ({
  checked,
  onCheckedChange,
  disabled,
  label,
  id,
}: CheckboxProps) => {
  return (
    <div className={styles.wrapper}>
      <RadixCheckbox.Root
        className={styles.checkbox}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        id={id}
      >
        <RadixCheckbox.Indicator className={styles.indicator}>
          <CheckIcon />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {label && (
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      )}
    </div>
  );
};
