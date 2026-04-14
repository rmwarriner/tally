import React, { useEffect, useState } from "react";
import { ArrowsClockwise, Plus, TreeStructure, PencilSimpleLine } from "@phosphor-icons/react";
import type { FinanceBookDocument } from "@tally/book";

interface CoaSidebarProps {
  accounts: FinanceBookDocument["accounts"];
  accountBalances: Array<{
    accountId: string;
    balance: number;
  }>;
  formatCurrency: (amount: number) => string;
  onAddTransaction: () => void;
  onOpenInActiveTab: (accountId: string) => void;
  onOpenInNewTab: (accountId: string) => void;
  onNewAccount: (parentAccountId: string | null) => void;
  onReconcile: () => void;
  selectedAccountId: string | null;
}

const accountTypeOrder: Array<FinanceBookDocument["accounts"][number]["type"]> = [
  "asset",
  "liability",
  "income",
  "expense",
  "equity",
];
const coaSidebarWidthStorageKey = "tally:coaSidebarWidth";
const coaSidebarMinWidth = 160;
const coaSidebarMaxWidth = 480;
const coaSidebarDefaultWidth = 220;

function clampCoaSidebarWidth(width: number): number {
  return Math.max(coaSidebarMinWidth, Math.min(coaSidebarMaxWidth, width));
}

export function CoaSidebar(props: CoaSidebarProps) {
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    accountId: string;
    x: number;
    y: number;
  } | null>(null);
  const balanceByAccountId = new Map(
    props.accountBalances.map((balance) => [balance.accountId, balance.balance]),
  );
  const childrenByParentId = new Map<string, FinanceBookDocument["accounts"]>();
  const rootAccounts: FinanceBookDocument["accounts"] = [];
  for (const account of props.accounts) {
    if (account.parentAccountId) {
      const siblings = childrenByParentId.get(account.parentAccountId) ?? [];
      siblings.push(account);
      childrenByParentId.set(account.parentAccountId, siblings);
    } else {
      rootAccounts.push(account);
    }
  }

  function toggleType(type: string) {
    setCollapsedTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function toggleAccount(accountId: string) {
    setCollapsedAccounts((current) => {
      const next = new Set(current);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  }

  function typeTotal(type: (typeof accountTypeOrder)[number]): number {
    return props.accounts
      .filter((account) => account.type === type)
      .reduce((sum, account) => sum + (balanceByAccountId.get(account.id) ?? 0), 0);
  }

  useEffect(() => {
    const stored = localStorage.getItem(coaSidebarWidthStorageKey);
    if (!stored) {
      return;
    }
    const parsed = Number.parseInt(stored, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    const nextWidth = clampCoaSidebarWidth(parsed);
    document.documentElement.style.setProperty("--coa-sidebar-width", `${nextWidth}px`);
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function handleClick() {
      setContextMenu(null);
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  function handleResizeMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const currentWidthValue = getComputedStyle(document.documentElement).getPropertyValue(
      "--coa-sidebar-width",
    );
    const parsedCurrentWidth = Number.parseInt(currentWidthValue, 10);
    const startWidth = Number.isNaN(parsedCurrentWidth)
      ? coaSidebarDefaultWidth
      : clampCoaSidebarWidth(parsedCurrentWidth);

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextWidth = clampCoaSidebarWidth(startWidth + (moveEvent.clientX - startX));
      document.documentElement.style.setProperty("--coa-sidebar-width", `${nextWidth}px`);
      localStorage.setItem(coaSidebarWidthStorageKey, String(nextWidth));
    }

    function handleMouseUp() {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  function renderAccountRow(
    account: FinanceBookDocument["accounts"][number],
    depth: number,
  ): React.ReactNode {
    const children = childrenByParentId.get(account.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = !collapsedAccounts.has(account.id);
    const balance = balanceByAccountId.get(account.id) ?? 0;

    return (
      <React.Fragment key={account.id}>
        <button
          className={`coa-row${props.selectedAccountId === account.id ? " active" : ""}`}
          style={{ paddingLeft: `${6 + depth * 12}px` }}
          type="button"
          onClick={() => props.onOpenInActiveTab(account.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ accountId: account.id, x: event.clientX, y: event.clientY });
          }}
        >
          {hasChildren ? (
            <span
              className={`coa-row-caret${isExpanded ? " expanded" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                toggleAccount(account.id);
              }}
            >
              ▸
            </span>
          ) : (
            <span className="coa-row-caret-spacer" />
          )}
          <span className="coa-row-name">{account.name}</span>
          <span className="coa-row-code">{account.code ?? ""}</span>
          <span
            className={[
              "coa-row-balance",
              balance > 0 ? "amount-positive" : balance < 0 ? "amount-negative" : "muted",
            ].join(" ")}
          >
            {props.formatCurrency(balance)}
          </span>
        </button>
        {hasChildren && isExpanded
          ? children.map((child) => renderAccountRow(child, depth + 1))
          : null}
      </React.Fragment>
    );
  }

  return (
    <section className="sidebar coa-sidebar">
      <div className="coa-toolbar-wrap">
        <div className="coa-toolbar">
          {props.selectedAccountId ? (
            <>
              <button
                aria-label="Add transaction"
                className="coa-toolbar-btn"
                title="Add transaction"
                type="button"
                onClick={props.onAddTransaction}
              >
                <PencilSimpleLine size={16} weight="light" />
              </button>
              <button
                aria-label="Reconcile"
                className="coa-toolbar-btn"
                title="Reconcile"
                type="button"
                onClick={props.onReconcile}
              >
                <ArrowsClockwise size={16} weight="light" />
              </button>
              <button
                aria-label="Add sub-account"
                className="coa-toolbar-btn"
                title="Add sub-account"
                type="button"
                onClick={() => props.onNewAccount(props.selectedAccountId)}
              >
                <TreeStructure size={16} weight="light" />
              </button>
            </>
          ) : (
            <button
              aria-label="Add account"
              className="coa-toolbar-btn"
              title="Add account"
              type="button"
              onClick={() => props.onNewAccount(null)}
            >
              <Plus size={16} weight="light" />
            </button>
          )}
        </div>
      </div>
      <div className="coa-tree-scroll">
        {accountTypeOrder.map((type) => {
          const typeRootAccounts = rootAccounts.filter((account) => account.type === type);
          if (typeRootAccounts.length === 0) {
            return null;
          }
          const isCollapsed = collapsedTypes.has(type);
          const total = typeTotal(type);

          return (
            <div key={type} className="coa-section">
              <button
                className="coa-section-header"
                type="button"
                onClick={() => toggleType(type)}
              >
                <span className={`coa-section-caret${isCollapsed ? "" : " expanded"}`}>▸</span>
                <span className="coa-section-label">{type}</span>
                <span className="coa-section-code-spacer" />
                <span
                  className={[
                    "coa-section-total",
                    total > 0 ? "amount-positive" : total < 0 ? "amount-negative" : "muted",
                  ].join(" ")}
                >
                  {props.formatCurrency(total)}
                </span>
              </button>
              {!isCollapsed
                ? typeRootAccounts.map((account) => renderAccountRow(account, 0))
                : null}
            </div>
          );
        })}
      </div>
      {contextMenu ? (
        <div
          className="coa-context-menu"
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            className="coa-context-menu-item"
            type="button"
            onClick={() => {
              props.onOpenInNewTab(contextMenu.accountId);
              setContextMenu(null);
            }}
          >
            Open in new tab
          </button>
        </div>
      ) : null}
      <div className="coa-resize-handle" onMouseDown={handleResizeMouseDown} />
    </section>
  );
}
