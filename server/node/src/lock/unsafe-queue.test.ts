import { describe, expect, it } from "vitest";
import { UnsafeNode, UnsafeQueue } from "./unsafe-queue";

describe("unsafe-queue", () => {
  it("push & remove", () => {
    const queue = new UnsafeQueue();
    const data: any = queue;

    const node1 = new UnsafeNode(1);
    const node2 = new UnsafeNode(1);

    queue.push(node1);

    expect(data._head).eq(node1);
    expect(data._tail).eq(node1);
    expect(node1.prev).eq(null);
    expect(node1.next).eq(null);
    expect(node2.prev).eq(null);
    expect(node2.next).eq(null);

    queue.push(node2);

    expect(data._head).eq(node1);
    expect(data._tail).eq(node2);
    expect(node1.prev).eq(null);
    expect(node1.next).eq(node2);
    expect(node2.prev).eq(node1);
    expect(node2.next).eq(null);

    queue.remove(node1);

    expect(data._head).eq(node2);
    expect(data._tail).eq(node2);
    expect(node1.prev).eq(null);
    expect(node1.next).eq(null);
    expect(node2.prev).eq(null);
    expect(node2.next).eq(null);
  });
});
