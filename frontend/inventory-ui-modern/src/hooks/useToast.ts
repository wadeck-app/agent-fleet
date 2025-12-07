/**
 * useToast hook - Toast notification state management
 * Based on shadcn/ui pattern
 */

import { useState, useCallback } from 'react';

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = {
  id: string;
  title?: string;
  description?: string;
  action?: React.ReactElement;
  variant?: 'default' | 'destructive';
};

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = {
  toasts: ToasterToast[];
};

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: { type: 'ADD_TOAST' | 'UPDATE_TOAST' | 'DISMISS_TOAST' | 'REMOVE_TOAST'; toast?: Partial<ToasterToast> & Pick<ToasterToast, 'id'> }) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

function reducer(state: State, action: { type: string; toast?: Partial<ToasterToast> & Pick<ToasterToast, 'id'> }): State {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast as ToasterToast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast?.id ? { ...t, ...action.toast } : t
        ),
      };

    case 'DISMISS_TOAST': {
      const { id } = action.toast || {};

      if (!id) {
        return {
          ...state,
          toasts: [],
        };
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === id ? { ...t, open: false } : t
        ) as ToasterToast[],
      };
    }

    case 'REMOVE_TOAST':
      if (action.toast?.id === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toast?.id),
      };
  }

  return state;
}

function toast({ ...props }: Omit<ToasterToast, 'id'>) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toast: { id } });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
    } as ToasterToast,
  });

  setTimeout(() => {
    dispatch({ type: 'REMOVE_TOAST', toast: { id } });
  }, TOAST_REMOVE_DELAY);

  return {
    id,
    dismiss,
    update,
  };
}

export function useToast() {
  const [state, setState] = useState<State>(memoryState);

  const subscribe = useCallback((listener: (state: State) => void) => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  const unsubscribe = useCallback(() => {
    listeners.length = 0;
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toast: { id: toastId || '' } }),
  };
}
