type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string | React.ReactNode;
  type: ToastType;
}

class ToastManager {
  private toasts: Toast[] = [];
  private listeners: Array<(toasts: Toast[]) => void> = [];

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  subscribe(listener: (toasts: Toast[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getToasts() {
    return [...this.toasts];
  }

  show(message: string | React.ReactNode, type: ToastType = "info") {
    const id = Math.random().toString(36).substring(7);
    const toast: Toast = { id, message, type };
    this.toasts.push(toast);
    this.notify();

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.remove(id);
    }, 5000);

    return id;
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  dismiss(key: string) {
    // For compatibility with the original API
    this.toasts = this.toasts.filter((t) => t.id !== key);
    this.notify();
  }
}

export const toastManager = new ToastManager();
