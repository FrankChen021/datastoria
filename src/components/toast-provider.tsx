import { useEffect, useState } from 'react';
import { toastManager } from '@/lib/toast';
import { Toast } from '@/components/ui/toast';

export function ToastProvider() {
  const [toasts, setToasts] = useState(toastManager.getToasts());

  useEffect(() => {
    const unsubscribe = toastManager.subscribe((newToasts) => {
      setToasts(newToasts);
    });

    return unsubscribe;
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          onDismiss={() => toastManager.remove(toast.id)}
        />
      ))}
    </div>
  );
}
