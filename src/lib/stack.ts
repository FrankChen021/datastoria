export class Stack<T> {
  private storage: T[] = [];

  push(item: T): void {
    this.storage.push(item);
  }

  pop(): T | undefined {
    return this.storage.pop();
  }

  peek(): T {
    return this.storage[this.size() - 1];
  }

  size(): number {
    return this.storage.length;
  }

  isNotEmpty(): boolean {
    return this.storage.length > 0;
  }

  isEmpty(): boolean {
    return this.storage.length === 0;
  }
}

