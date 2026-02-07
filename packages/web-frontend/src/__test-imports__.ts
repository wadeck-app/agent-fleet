// Test file to verify all imports compile correctly
// This file should be deleted after validation

import { EditableListField } from './framework/components2/list/EditableListField';
import { KeyValueItemRenderer } from './framework/components2/list/renderers/KeyValueItemRenderer';
import { OutputItemRenderer } from './framework/components2/list/renderers/OutputItemRenderer';
import { InputDefinitionRenderer } from './framework/components2/list/renderers/InputDefinitionRenderer';
import { useListItems } from './framework/hooks2/useListItems';
import { useSyncedListItems } from './framework/hooks2/useSyncedListItems';

// Type check: ensure exports are correct
const _test1: typeof EditableListField = EditableListField;
const _test2: typeof KeyValueItemRenderer = KeyValueItemRenderer;
const _test3: typeof OutputItemRenderer = OutputItemRenderer;
const _test4: typeof InputDefinitionRenderer = InputDefinitionRenderer;
const _test5: typeof useListItems = useListItems;
const _test6: typeof useSyncedListItems = useSyncedListItems;

console.log('All imports validated:', _test1, _test2, _test3, _test4, _test5, _test6);
