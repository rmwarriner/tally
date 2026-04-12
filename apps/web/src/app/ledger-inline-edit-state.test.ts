import { afterEach, describe, expect, it, vi } from "vitest";

describe("useLedgerInlineRowEditState", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps callbacks stable across rerenders", async () => {
    const stateSlots: unknown[] = [];
    const callbackSlots: Array<{ deps: unknown[]; fn: Function } | undefined> = [];
    const setStateFns = [
      vi.fn((next: unknown) => {
        stateSlots[0] = typeof next === "function" ? (next as (value: unknown) => unknown)(stateSlots[0]) : next;
      }),
      vi.fn((next: unknown) => {
        stateSlots[1] = typeof next === "function" ? (next as (value: unknown) => unknown)(stateSlots[1]) : next;
      }),
    ];

    let stateIndex = 0;
    let callbackIndex = 0;

    const resetRenderCursor = () => {
      stateIndex = 0;
      callbackIndex = 0;
    };

    const useStateMock = vi.fn((initialState: unknown) => {
      const currentIndex = stateIndex;
      stateIndex += 1;
      if (stateSlots[currentIndex] === undefined) {
        stateSlots[currentIndex] = initialState;
      }
      return [stateSlots[currentIndex], setStateFns[currentIndex]] as const;
    });

    const useCallbackMock = vi.fn((fn: Function, deps: unknown[]) => {
      const currentIndex = callbackIndex;
      callbackIndex += 1;
      const previousSlot = callbackSlots[currentIndex];
      if (
        previousSlot &&
        previousSlot.deps.length === deps.length &&
        previousSlot.deps.every((dependency, dependencyIndex) =>
          Object.is(dependency, deps[dependencyIndex]),
        )
      ) {
        return previousSlot.fn;
      }

      callbackSlots[currentIndex] = {
        deps: [...deps],
        fn,
      };
      return fn;
    });

    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        useCallback: useCallbackMock,
        useState: useStateMock,
      };
    });

    const { useLedgerInlineRowEditState } = await import("./ledger-state");

    resetRenderCursor();
    const firstRender = useLedgerInlineRowEditState();

    resetRenderCursor();
    const secondRender = useLedgerInlineRowEditState();

    expect(firstRender.startInlineEdit).toBe(secondRender.startInlineEdit);
    expect(firstRender.cancelInlineEdit).toBe(secondRender.cancelInlineEdit);
    expect(firstRender.finishInlineEdit).toBe(secondRender.finishInlineEdit);
    expect(firstRender.setInlineDraftField).toBe(secondRender.setInlineDraftField);
  });
});
