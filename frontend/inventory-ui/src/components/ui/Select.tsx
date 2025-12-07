import * as RadixSelect from '@radix-ui/react-select';
import styles from './Select.module.scss';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  fullWidth?: boolean;
}

export const Select = ({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  fullWidth = false,
}: SelectProps) => {
  const wrapperClasses = [
    styles.wrapper,
    fullWidth && styles['wrapper--full-width'],
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClasses}>
      {label && <label className={styles.label}>{label}</label>}
      <RadixSelect.Root value={value} onValueChange={onValueChange}>
        <RadixSelect.Trigger className={styles.trigger}>
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon className={styles.icon}>▼</RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content className={styles.content}>
            <RadixSelect.Viewport className={styles.viewport}>
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  className={styles.item}
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
};
