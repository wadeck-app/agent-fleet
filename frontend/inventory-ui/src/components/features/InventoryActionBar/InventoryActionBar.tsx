import { Button } from '../../ui/Button';
import { TrashIcon } from '../../ui/icons/TrashIcon';
import styles from './InventoryActionBar.module.scss';

export interface InventoryActionBarProps {
  selectedCount: number;
  onDeleteSelected: () => void;
}

export const InventoryActionBar = ({ selectedCount, onDeleteSelected }: InventoryActionBarProps) => {
  if (selectedCount === 0) {
    return null;
  }

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedCount} item(s)?`)) {
      onDeleteSelected();
    }
  };

  return (
    <div className={styles.actionBar}>
      <div className={styles.content}>
        <span className={styles.text}>
          {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
        </span>
        <Button variant="danger" size="md" onClick={handleDelete}>
          <TrashIcon />
          Delete Selected
        </Button>
      </div>
    </div>
  );
};
