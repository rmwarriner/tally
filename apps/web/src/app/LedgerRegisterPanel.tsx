import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { CaretDown, Check, DotsThree, X } from "@phosphor-icons/react";
import type { BookResponse } from "./api";
import { formatAmount, formatSignedCurrency, type AmountStyle } from "./app-format";
import {
  getInlineSplitAccountApplyKeyAction,
  getInlineSplitAccountGuidance,
  getInlineSplitAccountResolution,
  getSplitReorderKeyAction,
  getSplitQuickEditKeyAction,
  type LedgerInlineRowEditDraft,
  moveInlineSplitDraft,
  validateInlineLedgerSplitDrafts,
} from "./ledger-state";
import {
  findAccountSearchExactMatch,
  getAccountSearchMatches,
  getPreferredAccountTypesForPostingAmount,
  type createLedgerBookModel,
} from "./shell";

interface InlineNewTransactionDraft {
  amount: string;
  date: string;
  description: string;
  expenseAccountId: string;
  payee: string;
  status: "cleared" | "open" | "reconciled";
}

interface InlineSplitDraft {
  accountId: string;
  accountQuery: string;
  amount: string;
  cleared: boolean;
  commodityCode: string;
  memo: string;
}

interface LedgerRegisterPanelProps {
  activeLedgerRegisterTabId: string;
  amountStyle: AmountStyle;
  busy: string | null;
  expenseAccounts: BookResponse["book"]["accounts"];
  formatCurrency: (amount: number) => string;
  formatTransactionStatus: (status: "cleared" | "open" | "reconciled") => string;
  ledgerRange: { from: string; to: string };
  ledgerRegisterTabs: Array<{
    accountId: string | null;
    id: string;
    label: string;
  }>;
  ledgerSearchInputRef: RefObject<HTMLInputElement | null>;
  ledgerSearchText: string;
  ledgerStatusFilter: "all" | "cleared" | "open" | "reconciled";
  ledgerBook: ReturnType<typeof createLedgerBookModel>;
  isFiltered: boolean;
  liquidAccounts: BookResponse["book"]["accounts"];
  openingBalance: number;
  onActivateLedgerRegisterTab: (tabId: string) => void;
  onCancelInlineEdit: () => void;
  onCloseLedgerRegisterTab: (tabId: string) => void;
  onCreateInlineTransaction: (draft: InlineNewTransactionDraft) => void;
  onDeleteInlineTransaction: (transactionId: string) => void;
  onMoveLedgerRegisterTab: (direction: "left" | "right", tabId: string) => void;
  onOpenLinkedRegisterTabs: (transactionId: string) => void;
  onOpenLedgerRegisterTabForAccount: (accountId: string) => void;
  onOpenAdvancedEditor: (transactionId: string) => void;
  onSaveInlineEdit: (transactionId: string) => void;
  onSaveInlineSplitEdit: (input: { splits: InlineSplitDraft[]; transactionId: string }) => void;
  onStartInlineEdit: (transaction: ReturnType<typeof createLedgerBookModel>["filteredTransactions"][number]) => void;
  onUpdateInlineEditField: (field: keyof LedgerInlineRowEditDraft, value: string) => void;
  inlineEditDraft: LedgerInlineRowEditDraft | null;
  inlineEditingTransactionId: string | null;
  selectedLedgerAccountId: string | null;
  selectedLedgerTransactionId: string | null;
  setLedgerRange: Dispatch<SetStateAction<{ from: string; to: string }>>;
  setLedgerSearchText: Dispatch<SetStateAction<string>>;
  setLedgerStatusFilter: Dispatch<SetStateAction<"all" | "cleared" | "open" | "reconciled">>;
  setSelectedLedgerAccountId: Dispatch<SetStateAction<string | null>>;
  setSelectedLedgerTransactionId: Dispatch<SetStateAction<string | null>>;
  totalCount: number;
}

function formatDateAsYyyyMmDd(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function LedgerRegisterPanel(props: LedgerRegisterPanelProps) {
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [editingSplitTransactionId, setEditingSplitTransactionId] = useState<string | null>(null);
  const [activeSplitAccountSearchIndex, setActiveSplitAccountSearchIndex] = useState<number | null>(null);
  const [highlightedSplitAccountMatchIndex, setHighlightedSplitAccountMatchIndex] = useState(0);
  const [editingSplitDraft, setEditingSplitDraft] = useState<InlineSplitDraft[] | null>(null);
  const [openMenuTransactionId, setOpenMenuTransactionId] = useState<string | null>(null);
  const [confirmingDiscardTransactionId, setConfirmingDiscardTransactionId] = useState<string | null>(null);
  const splitAccountInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const splitMemoInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const splitAmountInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const splitClearedInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const splitSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const registerTableRef = useRef<HTMLTableElement | null>(null);
  const autoScrolledRegisterTabIdsRef = useRef<Set<string>>(new Set());
  const [newTransactionDraft, setNewTransactionDraft] = useState<InlineNewTransactionDraft>({
    amount: "0.00",
    date: "2026-04-03",
    description: "",
    expenseAccountId: props.expenseAccounts[0]?.id ?? "",
    payee: "",
    status: "open",
  });
  const [newRegisterTabAccountId, setNewRegisterTabAccountId] = useState(
    props.liquidAccounts[0]?.id ?? "",
  );
  const inlineDateIsValid = props.inlineEditDraft
    ? /^\d{4}-\d{2}-\d{2}$/.test(props.inlineEditDraft.occurredOn.trim())
    : false;
  const inlineDescriptionIsValid = props.inlineEditDraft
    ? props.inlineEditDraft.description.trim().length > 0
    : false;
  const inlineSaveDisabled = props.inlineEditDraft
    ? !inlineDateIsValid || !inlineDescriptionIsValid
    : true;
  const newRowDateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(newTransactionDraft.date.trim());
  const newRowDescriptionIsValid = newTransactionDraft.description.trim().length > 0;
  const newRowAmount = Number.parseFloat(newTransactionDraft.amount);
  const newRowAmountIsValid = Number.isFinite(newRowAmount) && newRowAmount > 0;
  const newRowAccountIsValid = newTransactionDraft.expenseAccountId.trim().length > 0;
  const newRowSaveDisabled =
    !newRowDateIsValid || !newRowDescriptionIsValid || !newRowAmountIsValid || !newRowAccountIsValid;
  const balanceAsOfDate = /^\d{4}-\d{2}-\d{2}$/.test(props.ledgerRange.to.trim())
    ? props.ledgerRange.to.trim()
    : formatDateAsYyyyMmDd(new Date());
  const visibleColumnCount = props.isFiltered ? 8 : 9;
  const accountById = new Map(props.ledgerBook.availableAccounts.map((account) => [account.id, account]));
  const getTransactionAmount = (transaction: ReturnType<typeof createLedgerBookModel>["filteredTransactions"][number]) => {
    if (!props.selectedLedgerAccountId) {
      return 0;
    }

    return transaction.postings.reduce((sum, posting) => {
      if (posting.accountId !== props.selectedLedgerAccountId) {
        return sum;
      }

      return sum + posting.amount;
    }, 0);
  };
  const runningBalances = new Map<string, number>();
  const balanceRows = [...props.ledgerBook.filteredTransactions].reverse();
  let runningBalance = props.openingBalance;
  for (const transaction of balanceRows) {
    runningBalance += getTransactionAmount(transaction);
    runningBalances.set(transaction.id, runningBalance);
  }

  useEffect(() => {
    if (newTransactionDraft.expenseAccountId) {
      return;
    }

    const fallbackAccount = props.expenseAccounts[0]?.id ?? "";
    if (!fallbackAccount) {
      return;
    }

    setNewTransactionDraft((current) => ({
      ...current,
      expenseAccountId: fallbackAccount,
    }));
  }, [newTransactionDraft.expenseAccountId, props.expenseAccounts]);

  useEffect(() => {
    if (newRegisterTabAccountId) {
      return;
    }

    const fallbackAccount = props.liquidAccounts[0]?.id ?? "";
    if (!fallbackAccount) {
      return;
    }

    setNewRegisterTabAccountId(fallbackAccount);
  }, [newRegisterTabAccountId, props.liquidAccounts]);

  useEffect(() => {
    if (!expandedTransactionId) {
      return;
    }

    const expandedRowStillVisible = props.ledgerBook.filteredTransactions.some(
      (transaction) => transaction.id === expandedTransactionId,
    );

    if (!expandedRowStillVisible) {
      setExpandedTransactionId(null);
    }
  }, [expandedTransactionId, props.ledgerBook.filteredTransactions]);

  useEffect(() => {
    if (!editingSplitTransactionId) {
      return;
    }

    const editedSplitRowStillVisible = props.ledgerBook.filteredTransactions.some(
      (transaction) => transaction.id === editingSplitTransactionId,
    );

    if (!editedSplitRowStillVisible) {
      setEditingSplitTransactionId(null);
      setEditingSplitDraft(null);
      setActiveSplitAccountSearchIndex(null);
      setHighlightedSplitAccountMatchIndex(0);
    }
  }, [editingSplitTransactionId, props.ledgerBook.filteredTransactions]);

  useEffect(() => {
    if (autoScrolledRegisterTabIdsRef.current.has(props.activeLedgerRegisterTabId)) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const tableElement = registerTableRef.current;
      if (!tableElement) {
        return;
      }

      const scrollHost = tableElement.closest(".editor-area");
      if (scrollHost instanceof HTMLElement) {
        scrollHost.scrollTop = scrollHost.scrollHeight;
      } else {
        tableElement.scrollIntoView({ block: "end" });
      }

      autoScrolledRegisterTabIdsRef.current.add(props.activeLedgerRegisterTabId);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [props.activeLedgerRegisterTabId]);

  useEffect(() => {
    if (!openMenuTransactionId) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      const menu = document.querySelector(`[data-menu-id="${openMenuTransactionId}"]`);
      if (menu && !menu.contains(event.target as Node)) {
        setOpenMenuTransactionId(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openMenuTransactionId]);

  useEffect(() => {
    if (!openMenuTransactionId) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuTransactionId(null);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [openMenuTransactionId]);

  function toggleSplitPreview(transactionId: string) {
    setExpandedTransactionId((current) => (current === transactionId ? null : transactionId));
    setEditingSplitTransactionId((current) => (current === transactionId ? null : current));
    if (editingSplitTransactionId === transactionId) {
      setEditingSplitDraft(null);
    }
  }

  function formatSplitAccountLabel(account: BookResponse["book"]["accounts"][number]): string {
    return account.code ? `${account.name} (${account.code})` : account.name;
  }

  function selectSplitAccount(splitIndex: number, accountId: string) {
    const account = props.ledgerBook.availableAccounts.find((candidate) => candidate.id === accountId);
    if (!account) {
      return;
    }

    setEditingSplitDraft((current) =>
      current
        ? current.map((candidate, candidateIndex) =>
            candidateIndex === splitIndex
              ? {
                  ...candidate,
                  accountId,
                  accountQuery: formatSplitAccountLabel(account),
                }
              : candidate,
          )
        : current,
    );
  }

  function focusSplitField(input: {
    field: "account" | "amount" | "cleared" | "memo" | "save";
    splitIndex: number;
  }) {
    if (input.field === "account") {
      splitAccountInputRefs.current[input.splitIndex]?.focus();
      return;
    }

    if (input.field === "memo") {
      splitMemoInputRefs.current[input.splitIndex]?.focus();
      return;
    }

    if (input.field === "amount") {
      splitAmountInputRefs.current[input.splitIndex]?.focus();
      return;
    }

    if (input.field === "cleared") {
      splitClearedInputRefs.current[input.splitIndex]?.focus();
      return;
    }

    splitSaveButtonRef.current?.focus();
  }

  return (
    <>
      <article className="panel register-panel">
        <div className="panel-header">
          <span>Register</span>
          <span className="muted">Double-entry ledger</span>
        </div>
        <div className="register-tab-row">
          {props.ledgerRegisterTabs.map((tab, tabIndex) => (
            <div key={tab.id} className={`register-tab${props.activeLedgerRegisterTabId === tab.id ? " active" : ""}`}>
              <button className="btn-ghost register-tab-trigger" type="button" onClick={() => props.onActivateLedgerRegisterTab(tab.id)}>
                <span className="register-tab-label">
                  <strong className="register-tab-account-name">{tab.label}</strong>
                  {tab.accountId ? (
                    <span className="register-tab-account-type">
                      {accountById.get(tab.accountId)?.type ?? "account"}
                    </span>
                  ) : (
                    <span className="register-tab-account-type">all</span>
                  )}
                </span>
              </button>
              <div className="register-tab-actions">
                <button
                  className="btn-ghost"
                  disabled={tabIndex === 0}
                  type="button"
                  onClick={() => props.onMoveLedgerRegisterTab("left", tab.id)}
                >
                  ←
                </button>
                <button
                  className="btn-ghost"
                  disabled={tabIndex + 1 >= props.ledgerRegisterTabs.length}
                  type="button"
                  onClick={() => props.onMoveLedgerRegisterTab("right", tab.id)}
                >
                  →
                </button>
                <button
                  className="btn-ghost"
                  disabled={props.ledgerRegisterTabs.length <= 1 || tab.id === "tab-all"}
                  type="button"
                  onClick={() => props.onCloseLedgerRegisterTab(tab.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <div className="register-tab-new">
            <select
              value={newRegisterTabAccountId}
              onChange={(event) => setNewRegisterTabAccountId(event.target.value)}
            >
              {props.liquidAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary"
              disabled={!newRegisterTabAccountId}
              type="button"
              onClick={() => {
                if (!newRegisterTabAccountId) {
                  return;
                }
                props.onOpenLedgerRegisterTabForAccount(newRegisterTabAccountId);
              }}
            >
              Open tab
            </button>
          </div>
        </div>
        <div className="ledger-toolbar">
          <label className="ledger-filter">
            <span className="muted">Search register</span>
            <input
              ref={props.ledgerSearchInputRef}
              data-testid="ledger-search-input"
              value={props.ledgerSearchText}
              placeholder="description, payee, account, tag, status"
              onChange={(event) => props.setLedgerSearchText(event.target.value)}
            />
          </label>
          <div className="ledger-range-row">
            <label className="ledger-filter">
              <span className="muted">From</span>
              <input
                value={props.ledgerRange.from}
                onChange={(event) =>
                  props.setLedgerRange((current) => ({ ...current, from: event.target.value }))
                }
              />
            </label>
            <label className="ledger-filter">
              <span className="muted">To</span>
              <input
                value={props.ledgerRange.to}
                onChange={(event) =>
                  props.setLedgerRange((current) => ({ ...current, to: event.target.value }))
                }
              />
            </label>
            {props.ledgerBook.selectedAccountBalance ? (
              <div className="ledger-balance-chip">
                <span>Active balance</span>
                <strong>{props.formatCurrency(props.ledgerBook.selectedAccountBalance.balance)}</strong>
              </div>
            ) : null}
          </div>
          <div className="ledger-chip-row">
            {(["all", "open", "cleared", "reconciled"] as const).map((status) => (
              <button
                key={status}
                className={`ledger-chip${props.ledgerStatusFilter === status ? " active" : ""}`}
                type="button"
                onClick={() => props.setLedgerStatusFilter(status)}
              >
                {status === "all" ? "All statuses" : status}
              </button>
            ))}
          </div>
          <div className="ledger-chip-row">
            <button
              className={`ledger-chip${props.selectedLedgerAccountId === null ? " active" : ""}`}
              type="button"
              onClick={() => props.setSelectedLedgerAccountId(null)}
            >
              All accounts
            </button>
            {props.liquidAccounts.slice(0, 4).map((account) => (
              <button
                key={account.id}
                className={`ledger-chip${props.selectedLedgerAccountId === account.id ? " active" : ""}`}
                type="button"
                onClick={() => props.setSelectedLedgerAccountId(account.id)}
              >
                {account.name}
              </button>
            ))}
          </div>
          <p className="form-hint">
            Hotkeys: `/` search, `j` or down move later, `k` or up move earlier, `Esc` clear
            selection, `Ctrl/Cmd+Shift+[ ]` switch tabs. Search supports tags, account code/name, and
            status tokens.
          </p>
        </div>
        <table ref={registerTableRef} className="register-table">
          <thead>
            <tr>
              <th className="register-col-date">Date</th>
              <th>Status</th>
              <th className="register-col-description">Description</th>
              <th className="register-col-payee">Payee</th>
              <th>Accounts</th>
              <th className="register-col-amount">Amount</th>
              {!props.isFiltered ? <th className="register-col-balance">Balance</th> : null}
              <th>Tags</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.ledgerBook.filteredTransactions.length > 0 ? (
              props.ledgerBook.filteredTransactions.map((transaction) => {
                const isEditingRow = props.inlineEditingTransactionId === transaction.id;
                const rowDraft = isEditingRow && props.inlineEditDraft ? props.inlineEditDraft : null;
                const canInlineEditCounterparty =
                  rowDraft !== null &&
                  props.selectedLedgerAccountId !== null &&
                  transaction.postings.length === 2 &&
                  transaction.postings.some(
                    (posting) => posting.accountId === props.selectedLedgerAccountId,
                  ) &&
                  transaction.postings.some(
                    (posting) => posting.accountId !== props.selectedLedgerAccountId,
                  );
                const inlineCounterpartyAccountOptions = canInlineEditCounterparty
                  ? props.ledgerBook.availableAccounts.filter(
                      (account) => account.id !== props.selectedLedgerAccountId,
                    )
                  : [];
                const inlineCounterpartyAccountValid =
                  !canInlineEditCounterparty || rowDraft.counterpartyAccountId.trim().length > 0;
                const inlineCounterpartyAmountValid =
                  !canInlineEditCounterparty || Number.isFinite(Number.parseFloat(rowDraft.accountAmount));
                const inlineRowSaveDisabled =
                  inlineSaveDisabled || !inlineCounterpartyAccountValid || !inlineCounterpartyAmountValid;
                const isDirty =
                  rowDraft !== null &&
                  (rowDraft.occurredOn !== transaction.occurredOn ||
                    rowDraft.description !== transaction.description ||
                    (rowDraft.payee ?? "") !== (transaction.payee ?? "") ||
                    rowDraft.status !== transaction.status);
                function handleCancelAttempt() {
                  setOpenMenuTransactionId(null);
                  if (isDirty) {
                    setConfirmingDiscardTransactionId(transaction.id);
                  } else {
                    setConfirmingDiscardTransactionId(null);
                    props.onCancelInlineEdit();
                  }
                }
                const focusInlineField = (field: "date" | "description" | "payee") => {
                  const fieldInput = document.querySelector<HTMLInputElement>(
                    `[data-testid="ledger-inline-${field}-${transaction.id}"]`,
                  );
                  fieldInput?.focus();
                };
                const isExpandedRow = expandedTransactionId === transaction.id;
                const isEditingSplitRow =
                  editingSplitTransactionId === transaction.id ? editingSplitDraft : null;
                const splitRowCount = isEditingSplitRow ? isEditingSplitRow.length : transaction.postings.length;
                const postingRows = isEditingSplitRow
                  ? isEditingSplitRow.map((split, postingIndex) => {
                      const selectedAccount = props.ledgerBook.availableAccounts.find(
                        (account) => account.id === split.accountId,
                      );
                      return {
                        accountName:
                          split.accountQuery || selectedAccount?.name || selectedAccount?.id || "Select account",
                        amount: split.amount,
                        cleared: split.cleared,
                        memo: split.memo,
                        postingIndex,
                      };
                    })
                  : transaction.postings.map((posting, postingIndex) => ({
                      accountName: posting.accountName,
                      amount: posting.amount,
                      cleared: posting.cleared,
                      memo: posting.memo ?? "",
                      postingIndex,
                    }));
                const splitValidation = isEditingSplitRow
                  ? validateInlineLedgerSplitDrafts({ splits: isEditingSplitRow })
                  : null;
                const splitAmountsAreValid = splitValidation?.allAmountsValid ?? true;
                const splitAccountsAreValid = splitValidation?.allAccountsValid ?? true;
                const splitHasMinimumRows = splitValidation?.hasMinimumRows ?? true;
                const splitIsBalanced = splitValidation?.isBalanced ?? true;
                const splitSaveDisabled =
                  props.busy !== null ||
                  !isEditingSplitRow ||
                  !(splitValidation?.canSave ?? false);

                return (
                  <>
                    <tr
                      key={transaction.id}
                      data-transaction-id={transaction.id}
                      className={[
                        "register-row",
                        props.selectedLedgerTransactionId === transaction.id ? "selected" : "",
                        isEditingRow ? "editing" : "",
                        isEditingRow && props.busy !== null ? "saving" : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => props.setSelectedLedgerTransactionId(transaction.id)}
                      onDoubleClick={() => {
                        props.setSelectedLedgerTransactionId(transaction.id);
                        props.onStartInlineEdit(transaction);
                      }}
                    >
                      <td className="register-cell-date">
                        {rowDraft ? (
                          <>
                            <input
                              data-testid={`ledger-inline-date-${transaction.id}`}
                              value={rowDraft.occurredOn}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                props.onUpdateInlineEditField("occurredOn", event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Tab") {
                                  event.preventDefault();
                                  if (event.shiftKey) {
                                    focusInlineField("payee");
                                  } else {
                                    focusInlineField("description");
                                  }
                                }

                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  if (!inlineRowSaveDisabled) {
                                    props.onSaveInlineEdit(transaction.id);
                                  }
                                }

                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  handleCancelAttempt();
                                }
                              }}
                            />
                            {!inlineDateIsValid ? (
                              <div className="form-hint error-text">Date must use YYYY-MM-DD.</div>
                            ) : null}
                          </>
                        ) : (
                          transaction.occurredOn
                        )}
                      </td>
                      <td>
                        {rowDraft ? (
                          <select
                            data-testid={`ledger-inline-status-${transaction.id}`}
                            value={rowDraft.status}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              props.onUpdateInlineEditField(
                                "status",
                                event.target.value as "cleared" | "open" | "reconciled",
                              )
                            }
                          >
                            <option value="open">Uncleared</option>
                            <option value="cleared">Cleared</option>
                            <option value="reconciled">Reconciled</option>
                          </select>
                        ) : (
                          <span className={`status-chip ${transaction.status}`}>
                            {props.formatTransactionStatus(transaction.status)}
                          </span>
                        )}
                      </td>
                      <td className="register-cell-description">
                        {rowDraft ? (
                          <>
                            <input
                              data-testid={`ledger-inline-description-${transaction.id}`}
                              value={rowDraft.description}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                props.onUpdateInlineEditField("description", event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Tab") {
                                  event.preventDefault();
                                  if (event.shiftKey) {
                                    focusInlineField("date");
                                  } else {
                                    focusInlineField("payee");
                                  }
                                }

                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  if (!inlineRowSaveDisabled) {
                                    props.onSaveInlineEdit(transaction.id);
                                  }
                                }

                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  handleCancelAttempt();
                                }
                              }}
                            />
                            {!inlineDescriptionIsValid ? (
                              <div className="form-hint error-text">Description is required.</div>
                            ) : null}
                          </>
                        ) : (
                          transaction.description
                        )}
                      </td>
                      <td className="register-cell-payee">
                        {rowDraft ? (
                          <input
                            data-testid={`ledger-inline-payee-${transaction.id}`}
                            value={rowDraft.payee}
                            placeholder="Unassigned"
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => props.onUpdateInlineEditField("payee", event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Tab") {
                                event.preventDefault();
                                if (event.shiftKey) {
                                  focusInlineField("description");
                                } else if (!inlineRowSaveDisabled) {
                                  props.onSaveInlineEdit(transaction.id);
                                }
                              }

                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (!inlineRowSaveDisabled) {
                                  props.onSaveInlineEdit(transaction.id);
                                }
                              }

                              if (event.key === "Escape") {
                                event.preventDefault();
                                handleCancelAttempt();
                              }
                            }}
                          />
                        ) : (
                          transaction.payee ?? "Unassigned"
                        )}
                      </td>
                      <td className="register-cell-accounts">
                        {canInlineEditCounterparty ? (
                          <select
                            data-testid={`ledger-inline-account-${transaction.id}`}
                            value={rowDraft.counterpartyAccountId}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              props.onUpdateInlineEditField("counterpartyAccountId", event.target.value)
                            }
                          >
                            {inlineCounterpartyAccountOptions.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.code ? `${account.name} (${account.code})` : account.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          transaction.postings.map((posting) => posting.accountName).join(", ")
                        )}
                      </td>
                      <td className="register-cell-amount">
                        {canInlineEditCounterparty ? (
                          <input
                            data-testid={`ledger-inline-amount-${transaction.id}`}
                            value={rowDraft.accountAmount}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              props.onUpdateInlineEditField("accountAmount", event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (!inlineRowSaveDisabled) {
                                  props.onSaveInlineEdit(transaction.id);
                                }
                              }

                              if (event.key === "Escape") {
                                event.preventDefault();
                                props.onCancelInlineEdit();
                              }
                            }}
                          />
                        ) : (
                          <strong
                            className={
                              getTransactionAmount(transaction) > 0
                                ? "amount-positive"
                                : getTransactionAmount(transaction) < 0
                                  ? "amount-negative"
                                  : "muted"
                            }
                          >
                            {formatAmount(
                              getTransactionAmount(transaction),
                              props.formatCurrency,
                              props.amountStyle,
                            )}
                          </strong>
                        )}
                      </td>
                      {!props.isFiltered ? (
                        <td className="register-cell-balance">
                          <strong
                            className={
                              (runningBalances.get(transaction.id) ?? 0) > 0
                                ? "amount-positive"
                                : (runningBalances.get(transaction.id) ?? 0) < 0
                                  ? "amount-negative"
                                  : "amount-neutral"
                            }
                          >
                            {formatAmount(
                              runningBalances.get(transaction.id) ?? 0,
                              props.formatCurrency,
                              props.amountStyle,
                            )}
                          </strong>
                        </td>
                      ) : null}
                      <td>{transaction.tags.join(", ")}</td>
                      <td className="register-cell-actions" style={{ position: "relative" }}>
                        {isEditingRow && confirmingDiscardTransactionId === transaction.id ? (
                          <div className="row-actions">
                            <span className="row-action-confirm-label">Discard changes?</span>
                            <button
                              className="row-action-text-btn"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setConfirmingDiscardTransactionId(null);
                                props.onCancelInlineEdit();
                              }}
                            >
                              Discard
                            </button>
                            <button
                              className="row-action-text-btn"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setConfirmingDiscardTransactionId(null);
                              }}
                            >
                              Keep editing
                            </button>
                          </div>
                        ) : (
                          <div className="row-actions">
                            {isEditingRow ? (
                              <>
                                <button
                                  className="row-action-button save"
                                  data-testid={`ledger-save-${transaction.id}`}
                                  disabled={inlineRowSaveDisabled}
                                  title="Save"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!inlineRowSaveDisabled) {
                                      setConfirmingDiscardTransactionId(null);
                                      props.onSaveInlineEdit(transaction.id);
                                    }
                                  }}
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  className="row-action-button discard"
                                  data-testid={`ledger-cancel-${transaction.id}`}
                                  title="Cancel"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleCancelAttempt();
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : null}
                            <button
                              className="row-action-button"
                              title={isExpandedRow ? "Hide splits" : "Show splits"}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleSplitPreview(transaction.id);
                              }}
                            >
                              <CaretDown size={14} />
                            </button>
                            <div className="row-action-menu-anchor" data-menu-id={transaction.id}>
                              <button
                                className="row-action-button"
                                title="More actions"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenMenuTransactionId((current) =>
                                    current === transaction.id ? null : transaction.id,
                                  );
                                }}
                              >
                                <DotsThree size={14} />
                              </button>
                              {openMenuTransactionId === transaction.id ? (
                                <div className="row-action-menu">
                                  <button
                                    className="row-action-menu-item"
                                    data-testid={`ledger-edit-${transaction.id}`}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenMenuTransactionId(null);
                                      props.setSelectedLedgerTransactionId(transaction.id);
                                      props.onStartInlineEdit(transaction);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="row-action-menu-item"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenMenuTransactionId(null);
                                      props.onOpenLinkedRegisterTabs(transaction.id);
                                    }}
                                  >
                                    Link tabs
                                  </button>
                                  <button
                                    className="row-action-menu-item"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenMenuTransactionId(null);
                                      props.setSelectedLedgerTransactionId(transaction.id);
                                      props.onOpenAdvancedEditor(transaction.id);
                                    }}
                                  >
                                    Advanced
                                  </button>
                                  <div className="row-action-menu-separator" />
                                  <button
                                    className="row-action-menu-item danger"
                                    data-testid={`ledger-delete-${transaction.id}`}
                                    disabled={props.busy !== null}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenMenuTransactionId(null);
                                      props.onDeleteInlineTransaction(transaction.id);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpandedRow ? (
                      <tr className="register-row">
                        <td colSpan={visibleColumnCount}>
                          <div className="detail-stack">
                            <div className="panel-header">
                              <span>Split preview</span>
                              <span className="muted">{transaction.id}</span>
                            </div>
                            {postingRows.map((posting) => {
                              const splitDraftRow = isEditingSplitRow?.[posting.postingIndex] ?? null;
                              const splitAccountQuery = splitDraftRow?.accountQuery ?? "";
                              const splitAccountResolution = splitDraftRow
                                ? getInlineSplitAccountResolution({
                                    accountId: splitDraftRow.accountId,
                                    accountQuery: splitDraftRow.accountQuery,
                                  })
                                : "empty";
                              const splitAccountStatusChip =
                                splitAccountResolution === "resolved"
                                  ? { className: "reconciled", label: "Account set" }
                                  : splitAccountResolution === "unresolved"
                                    ? { className: "warning", label: "Unresolved account" }
                                    : { className: "open", label: "Account required" };
                              const accountMatches =
                                splitDraftRow !== null
                                  ? getAccountSearchMatches({
                                      accounts: props.ledgerBook.availableAccounts,
                                      preferredAccountTypes: getPreferredAccountTypesForPostingAmount(
                                        splitDraftRow.amount,
                                      ),
                                      query: splitAccountQuery,
                                      selectedAccountId: splitDraftRow.accountId,
                                    })
                                  : [];
                              const highlightedAccountMatch =
                                accountMatches[
                                  Math.min(
                                    highlightedSplitAccountMatchIndex,
                                    Math.max(accountMatches.length - 1, 0),
                                  )
                                ] ?? null;

                              return (
                                <div
                                  key={`${transaction.id}:split:${posting.postingIndex}`}
                                  className="posting-summary-row"
                                >
                                <div>
                                  <strong>{posting.accountName}</strong>
                                  {isEditingSplitRow ? (
                                    <div className="form-inline">
                                      <label className="account-search-field">
                                        <input
                                          ref={(element) => {
                                            splitAccountInputRefs.current[posting.postingIndex] = element;
                                          }}
                                          value={splitAccountQuery}
                                          placeholder="Search account"
                                          role="combobox"
                                          aria-autocomplete="list"
                                          aria-expanded={activeSplitAccountSearchIndex === posting.postingIndex}
                                          aria-controls={`split-account-options-${transaction.id}-${posting.postingIndex}`}
                                          onFocus={() => {
                                            setActiveSplitAccountSearchIndex(posting.postingIndex);
                                            setHighlightedSplitAccountMatchIndex(0);
                                          }}
                                          onBlur={() => {
                                            setActiveSplitAccountSearchIndex((current) =>
                                              current === posting.postingIndex ? null : current,
                                            );
                                            if (!splitDraftRow) {
                                              return;
                                            }

                                            const exactMatch = findAccountSearchExactMatch({
                                              accounts: props.ledgerBook.availableAccounts,
                                              query: splitDraftRow.accountQuery,
                                            });
                                            if (exactMatch) {
                                              selectSplitAccount(posting.postingIndex, exactMatch.id);
                                              return;
                                            }

                                            if (splitDraftRow.accountId) {
                                              selectSplitAccount(posting.postingIndex, splitDraftRow.accountId);
                                            }
                                          }}
                                          onKeyDown={(event) => {
                                            const reorderAction = getSplitReorderKeyAction({
                                              altKey: event.altKey,
                                              key: event.key,
                                              splitCount: splitRowCount,
                                              splitIndex: posting.postingIndex,
                                            });
                                            if (reorderAction.type !== "none") {
                                              event.preventDefault();
                                              setEditingSplitDraft((current) =>
                                                current
                                                  ? moveInlineSplitDraft({
                                                      direction:
                                                        reorderAction.type === "move-up" ? "up" : "down",
                                                      splitIndex: posting.postingIndex,
                                                      splits: current,
                                                    })
                                                  : current,
                                              );
                                              window.setTimeout(() => {
                                                focusSplitField({
                                                  field: "account",
                                                  splitIndex: reorderAction.nextIndex,
                                                });
                                              }, 0);
                                              return;
                                            }

                                            const applyAction = getInlineSplitAccountApplyKeyAction({
                                              ctrlKey: event.ctrlKey,
                                              key: event.key,
                                              matchCount: accountMatches.length,
                                            });
                                            if (applyAction.type === "apply-first-match") {
                                              event.preventDefault();
                                              const firstMatch = accountMatches[0];
                                              if (!firstMatch) {
                                                return;
                                              }

                                              selectSplitAccount(posting.postingIndex, firstMatch.account.id);
                                              focusSplitField({
                                                field: "memo",
                                                splitIndex: posting.postingIndex,
                                              });
                                              return;
                                            }

                                          if (event.key === "ArrowDown") {
                                            event.preventDefault();
                                            setActiveSplitAccountSearchIndex(posting.postingIndex);
                                            setHighlightedSplitAccountMatchIndex((current) =>
                                              Math.min(current + 1, Math.max(accountMatches.length - 1, 0)),
                                            );
                                            return;
                                          }

                                          if (event.key === "ArrowUp") {
                                            event.preventDefault();
                                            setActiveSplitAccountSearchIndex(posting.postingIndex);
                                            setHighlightedSplitAccountMatchIndex((current) =>
                                              Math.max(current - 1, 0),
                                            );
                                            return;
                                          }

                                          if (event.key === "Escape") {
                                            event.preventDefault();
                                            setActiveSplitAccountSearchIndex(null);
                                            return;
                                          }

                                          if (
                                            event.key === "Enter" &&
                                            !event.ctrlKey &&
                                            !event.metaKey &&
                                            !event.shiftKey
                                          ) {
                                            event.preventDefault();
                                            if (highlightedAccountMatch) {
                                              selectSplitAccount(
                                                posting.postingIndex,
                                                highlightedAccountMatch.account.id,
                                              );
                                            }
                                            focusSplitField({
                                              field: "memo",
                                              splitIndex: posting.postingIndex,
                                            });
                                          }
                                        }}
                                          onChange={(event) => {
                                            const exactMatch = findAccountSearchExactMatch({
                                              accounts: props.ledgerBook.availableAccounts,
                                              query: event.target.value,
                                            });
                                            setEditingSplitDraft((current) =>
                                              current
                                                ? current.map((candidate, candidateIndex) =>
                                                    candidateIndex === posting.postingIndex
                                                      ? {
                                                          ...candidate,
                                                          accountId: exactMatch?.id ?? "",
                                                          accountQuery: event.target.value,
                                                        }
                                                      : candidate,
                                                  )
                                                : current,
                                            );
                                            setActiveSplitAccountSearchIndex(posting.postingIndex);
                                            setHighlightedSplitAccountMatchIndex(0);
                                          }}
                                        />
                                        {activeSplitAccountSearchIndex === posting.postingIndex ? (
                                          <div
                                            id={`split-account-options-${transaction.id}-${posting.postingIndex}`}
                                            className="account-search-menu"
                                            role="listbox"
                                          >
                                            {accountMatches.length > 0 ? (
                                              accountMatches.map((match, matchIndex) => (
                                                <button
                                                  key={match.account.id}
                                                  className={`account-search-option${
                                                    matchIndex === highlightedSplitAccountMatchIndex
                                                      ? " active"
                                                      : ""
                                                  }`}
                                                  type="button"
                                                  onMouseDown={(event) => {
                                                    event.preventDefault();
                                                    selectSplitAccount(posting.postingIndex, match.account.id);
                                                    window.setTimeout(() => {
                                                      focusSplitField({
                                                        field: "memo",
                                                        splitIndex: posting.postingIndex,
                                                      });
                                                    }, 0);
                                                  }}
                                                >
                                                  <div className="account-search-option-row">
                                                    <strong>{match.label}</strong>
                                                    {match.recommended ? (
                                                      <span className="account-search-badge">Suggested</span>
                                                    ) : null}
                                                  </div>
                                                  <span>{match.meta}</span>
                                                </button>
                                              ))
                                            ) : (
                                              <div className="account-search-empty">
                                                {getInlineSplitAccountGuidance({
                                                  accountQuery: splitAccountQuery,
                                                  matchCount: accountMatches.length,
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        ) : null}
                                        <span className={`status-chip account-resolution-chip ${splitAccountStatusChip.className}`}>
                                          {splitAccountStatusChip.label}
                                        </span>
                                      </label>
                                      <input
                                        ref={(element) => {
                                          splitMemoInputRefs.current[posting.postingIndex] = element;
                                        }}
                                        value={isEditingSplitRow[posting.postingIndex]?.memo ?? ""}
                                        placeholder="Memo"
                                        onKeyDown={(event) => {
                                          const reorderAction = getSplitReorderKeyAction({
                                            altKey: event.altKey,
                                            key: event.key,
                                            splitCount: splitRowCount,
                                            splitIndex: posting.postingIndex,
                                          });
                                          if (reorderAction.type !== "none") {
                                            event.preventDefault();
                                            setEditingSplitDraft((current) =>
                                              current
                                                ? moveInlineSplitDraft({
                                                    direction:
                                                      reorderAction.type === "move-up" ? "up" : "down",
                                                    splitIndex: posting.postingIndex,
                                                    splits: current,
                                                  })
                                                : current,
                                            );
                                            window.setTimeout(() => {
                                              focusSplitField({
                                                field: "memo",
                                                splitIndex: reorderAction.nextIndex,
                                              });
                                            }, 0);
                                            return;
                                          }

                                          const keyAction = getSplitQuickEditKeyAction({
                                            field: "memo",
                                            key: event.key,
                                            splitCount: splitRowCount,
                                            splitIndex: posting.postingIndex,
                                          });

                                          if (keyAction.type === "none") {
                                            return;
                                          }

                                          event.preventDefault();

                                          if (keyAction.type === "cancel") {
                                            setEditingSplitTransactionId(null);
                                            setEditingSplitDraft(null);
                                            setActiveSplitAccountSearchIndex(null);
                                            setHighlightedSplitAccountMatchIndex(0);
                                            return;
                                          }

                                          if (keyAction.type === "focus-amount") {
                                            focusSplitField({
                                              field: "amount",
                                              splitIndex: keyAction.splitIndex,
                                            });
                                          }
                                        }}
                                        onChange={(event) => {
                                          setEditingSplitDraft((current) =>
                                            current
                                              ? current.map((candidate, candidateIndex) =>
                                                  candidateIndex === posting.postingIndex
                                                    ? { ...candidate, memo: event.target.value }
                                                    : candidate,
                                                )
                                              : current,
                                          );
                                        }}
                                      />
                                      <input
                                        ref={(element) => {
                                          splitAmountInputRefs.current[posting.postingIndex] = element;
                                        }}
                                        value={isEditingSplitRow[posting.postingIndex]?.amount ?? ""}
                                        placeholder="Amount"
                                        onKeyDown={(event) => {
                                          const reorderAction = getSplitReorderKeyAction({
                                            altKey: event.altKey,
                                            key: event.key,
                                            splitCount: splitRowCount,
                                            splitIndex: posting.postingIndex,
                                          });
                                          if (reorderAction.type !== "none") {
                                            event.preventDefault();
                                            setEditingSplitDraft((current) =>
                                              current
                                                ? moveInlineSplitDraft({
                                                    direction:
                                                      reorderAction.type === "move-up" ? "up" : "down",
                                                    splitIndex: posting.postingIndex,
                                                    splits: current,
                                                  })
                                                : current,
                                            );
                                            window.setTimeout(() => {
                                              focusSplitField({
                                                field: "amount",
                                                splitIndex: reorderAction.nextIndex,
                                              });
                                            }, 0);
                                            return;
                                          }

                                          const keyAction = getSplitQuickEditKeyAction({
                                            field: "amount",
                                            key: event.key,
                                            splitCount: splitRowCount,
                                            splitIndex: posting.postingIndex,
                                          });

                                          if (keyAction.type === "none") {
                                            return;
                                          }

                                          event.preventDefault();

                                          if (keyAction.type === "cancel") {
                                            setEditingSplitTransactionId(null);
                                            setEditingSplitDraft(null);
                                            setActiveSplitAccountSearchIndex(null);
                                            setHighlightedSplitAccountMatchIndex(0);
                                            return;
                                          }

                                          if (keyAction.type === "focus-cleared") {
                                            focusSplitField({
                                              field: "cleared",
                                              splitIndex: keyAction.splitIndex,
                                            });
                                          }
                                        }}
                                        onChange={(event) => {
                                          setEditingSplitDraft((current) =>
                                            current
                                              ? current.map((candidate, candidateIndex) =>
                                                  candidateIndex === posting.postingIndex
                                                    ? { ...candidate, amount: event.target.value }
                                                    : candidate,
                                                )
                                              : current,
                                          );
                                        }}
                                      />
                                      <label className="checkbox-row">
                                        <input
                                          ref={(element) => {
                                            splitClearedInputRefs.current[posting.postingIndex] = element;
                                          }}
                                          checked={isEditingSplitRow[posting.postingIndex]?.cleared ?? false}
                                          type="checkbox"
                                          onKeyDown={(event) => {
                                            const reorderAction = getSplitReorderKeyAction({
                                              altKey: event.altKey,
                                              key: event.key,
                                              splitCount: splitRowCount,
                                              splitIndex: posting.postingIndex,
                                            });
                                            if (reorderAction.type !== "none") {
                                              event.preventDefault();
                                              setEditingSplitDraft((current) =>
                                                current
                                                  ? moveInlineSplitDraft({
                                                      direction:
                                                        reorderAction.type === "move-up" ? "up" : "down",
                                                      splitIndex: posting.postingIndex,
                                                      splits: current,
                                                    })
                                                  : current,
                                              );
                                              window.setTimeout(() => {
                                                focusSplitField({
                                                  field: "cleared",
                                                  splitIndex: reorderAction.nextIndex,
                                                });
                                              }, 0);
                                              return;
                                            }

                                            const keyAction = getSplitQuickEditKeyAction({
                                              field: "cleared",
                                              key: event.key,
                                              splitCount: splitRowCount,
                                              splitIndex: posting.postingIndex,
                                            });

                                            if (keyAction.type === "none") {
                                              return;
                                            }

                                            event.preventDefault();

                                            if (keyAction.type === "cancel") {
                                              setEditingSplitTransactionId(null);
                                              setEditingSplitDraft(null);
                                              setActiveSplitAccountSearchIndex(null);
                                              setHighlightedSplitAccountMatchIndex(0);
                                              return;
                                            }

                                            if (keyAction.type === "focus-memo") {
                                              focusSplitField({
                                                field: "memo",
                                                splitIndex: keyAction.splitIndex,
                                              });
                                              return;
                                            }

                                            if (keyAction.type === "focus-save") {
                                              focusSplitField({ field: "save", splitIndex: posting.postingIndex });
                                            }
                                          }}
                                          onChange={(event) => {
                                            setEditingSplitDraft((current) =>
                                              current
                                                ? current.map((candidate, candidateIndex) =>
                                                    candidateIndex === posting.postingIndex
                                                      ? {
                                                          ...candidate,
                                                          cleared: event.target.checked,
                                                        }
                                                      : candidate,
                                                  )
                                                : current,
                                            );
                                          }}
                                        />
                                        <span>Cleared</span>
                                      </label>
                                      <button
                                        className="btn-secondary"
                                        disabled={posting.postingIndex === 0}
                                        type="button"
                                        onClick={() => {
                                          setEditingSplitDraft((current) =>
                                            current
                                              ? moveInlineSplitDraft({
                                                  direction: "up",
                                                  splitIndex: posting.postingIndex,
                                                  splits: current,
                                                })
                                              : current,
                                          );
                                          window.setTimeout(() => {
                                            focusSplitField({
                                              field: "memo",
                                              splitIndex: Math.max(0, posting.postingIndex - 1),
                                            });
                                          }, 0);
                                        }}
                                      >
                                        Up
                                      </button>
                                      <button
                                        className="btn-secondary"
                                        disabled={posting.postingIndex + 1 >= splitRowCount}
                                        type="button"
                                        onClick={() => {
                                          setEditingSplitDraft((current) =>
                                            current
                                              ? moveInlineSplitDraft({
                                                  direction: "down",
                                                  splitIndex: posting.postingIndex,
                                                  splits: current,
                                                })
                                              : current,
                                          );
                                          window.setTimeout(() => {
                                            focusSplitField({
                                              field: "memo",
                                              splitIndex: Math.min(splitRowCount - 1, posting.postingIndex + 1),
                                            });
                                          }, 0);
                                        }}
                                      >
                                        Down
                                      </button>
                                      <button
                                        className="btn-secondary"
                                        disabled={isEditingSplitRow.length <= 2}
                                        type="button"
                                        onClick={() => {
                                          setEditingSplitDraft((current) =>
                                            current
                                              ? current.filter(
                                                  (_, candidateIndex) =>
                                                    candidateIndex !== posting.postingIndex,
                                                )
                                              : current,
                                          );
                                        }}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="candidate-meta">
                                      {posting.memo ?? "No memo"}
                                      {posting.cleared ? " · cleared" : " · open"}
                                    </div>
                                  )}
                                </div>
                                <strong>
                                  {isEditingSplitRow
                                    ? isEditingSplitRow[posting.postingIndex]?.amount ?? posting.amount
                                    : posting.amount}
                                </strong>
                              </div>
                              );
                            })}
                            <div className="posting-editor-row">
                              {isEditingSplitRow ? (
                                <>
                                  <div className="form-hint">
                                    Tip: `Alt` + `Up/Down` reorders split rows. `Tab` or `Ctrl+Enter` accepts the
                                    first account match.
                                  </div>
                                  <button
                                    className="btn-secondary"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      const fallbackAccountId =
                                        props.selectedLedgerAccountId ??
                                        props.ledgerBook.availableAccounts[0]?.id ??
                                        "";
                                      if (!fallbackAccountId) {
                                        return;
                                      }
                                      const fallbackAccount = props.ledgerBook.availableAccounts.find(
                                        (account) => account.id === fallbackAccountId,
                                      );
                                      const fallbackAccountQuery = fallbackAccount
                                        ? formatSplitAccountLabel(fallbackAccount)
                                        : fallbackAccountId;

                                      setEditingSplitDraft((current) =>
                                        current
                                          ? [
                                              ...current,
                                              {
                                                accountId: fallbackAccountId,
                                                accountQuery: fallbackAccountQuery,
                                                amount: "0",
                                                cleared: false,
                                                commodityCode:
                                                  current[0]?.commodityCode ??
                                                  transaction.postings[0]?.commodityCode ??
                                                  "USD",
                                                memo: "",
                                              },
                                            ]
                                          : current,
                                      );
                                    }}
                                  >
                                    Add split
                                  </button>
                                  {!splitHasMinimumRows ? (
                                    <div className="form-hint error-text">
                                      Split edits require at least two rows.
                                    </div>
                                  ) : null}
                                  {!splitAccountsAreValid ? (
                                    <div className="form-hint error-text">
                                      Each split must reference an account.
                                    </div>
                                  ) : null}
                                  {splitIsBalanced ? (
                                    <div className="editor-balance-callout balanced">
                                      <div className="editor-balance-callout-header">
                                        <strong>Balanced</strong>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="editor-balance-callout warning">
                                      <div className="editor-balance-callout-header">
                                        {splitAmountsAreValid ? (
                                          <span>
                                            Remaining difference:{" "}
                                            {formatSignedCurrency(splitValidation?.splitBalance ?? 0)}
                                          </span>
                                        ) : (
                                          <span>Invalid amounts - fix before saving.</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  <button
                                    className="btn-primary"
                                    ref={splitSaveButtonRef}
                                    disabled={splitSaveDisabled}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (!splitSaveDisabled) {
                                        props.onSaveInlineSplitEdit({
                                          splits: isEditingSplitRow,
                                          transactionId: transaction.id,
                                        });
                                        setEditingSplitTransactionId(null);
                                        setEditingSplitDraft(null);
                                        setActiveSplitAccountSearchIndex(null);
                                        setHighlightedSplitAccountMatchIndex(0);
                                      }
                                    }}
                                  >
                                    {props.busy === "Transaction update" ? "Saving..." : "Save split changes"}
                                  </button>
                                  <button
                                    className="btn-secondary"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setEditingSplitTransactionId(null);
                                      setEditingSplitDraft(null);
                                      setActiveSplitAccountSearchIndex(null);
                                      setHighlightedSplitAccountMatchIndex(0);
                                    }}
                                  >
                                    Cancel split changes
                                  </button>
                                </>
                              ) : (
                                <button
                                  className="btn-secondary"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingSplitTransactionId(transaction.id);
                                    setActiveSplitAccountSearchIndex(null);
                                    setHighlightedSplitAccountMatchIndex(0);
                                    setEditingSplitDraft(
                                      transaction.postings.map((posting) => ({
                                        accountId: posting.accountId,
                                        accountQuery: posting.accountCode
                                          ? `${posting.accountName} (${posting.accountCode})`
                                          : posting.accountName,
                                        amount: String(posting.amount),
                                        cleared: posting.cleared,
                                        commodityCode: posting.commodityCode,
                                        memo: posting.memo ?? "",
                                      })),
                                    );
                                  }}
                                >
                                  Quick edit splits
                                </button>
                              )}
                              <button
                                className="btn-secondary"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  props.setSelectedLedgerTransactionId(transaction.id);
                                  props.onOpenAdvancedEditor(transaction.id);
                                }}
                              >
                                Edit splits in advanced editor
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })
            ) : (
              <tr>
                <td colSpan={visibleColumnCount}>
                  <div className="table-empty-state">
                    No transactions match the current account filter, date range, and search text.
                  </div>
                </td>
              </tr>
            )}
            <tr className="register-row register-row-new">
              <td className="register-cell-date">
                <input
                  value={newTransactionDraft.date}
                  onChange={(event) =>
                    setNewTransactionDraft((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
              </td>
              <td>
                <select
                  data-testid="ledger-new-status"
                  value={newTransactionDraft.status}
                  onChange={(event) =>
                    setNewTransactionDraft((current) => ({
                      ...current,
                      status: event.target.value as "cleared" | "open" | "reconciled",
                    }))
                  }
                >
                  <option value="open">Uncleared</option>
                  <option value="cleared">Cleared</option>
                  <option value="reconciled">Reconciled</option>
                </select>
              </td>
              <td className="register-cell-description">
                <input
                  value={newTransactionDraft.description}
                  placeholder="New transaction"
                  onChange={(event) =>
                    setNewTransactionDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </td>
              <td className="register-cell-payee">
                <input
                  value={newTransactionDraft.payee}
                  placeholder="Unassigned"
                  onChange={(event) =>
                    setNewTransactionDraft((current) => ({
                      ...current,
                      payee: event.target.value,
                    }))
                  }
                />
              </td>
              <td className="register-cell-accounts">
                <select
                  value={newTransactionDraft.expenseAccountId}
                  onChange={(event) =>
                    setNewTransactionDraft((current) => ({
                      ...current,
                      expenseAccountId: event.target.value,
                    }))
                  }
                >
                  {props.expenseAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="register-cell-amount">
                <input
                  value={newTransactionDraft.amount}
                  onChange={(event) =>
                    setNewTransactionDraft((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                />
              </td>
              {!props.isFiltered ? <td className="register-cell-balance" /> : null}
              <td />
              <td>
                <button
                  className="btn-primary"
                  data-testid="ledger-post-transaction"
                  disabled={newRowSaveDisabled || props.busy !== null}
                  type="button"
                  onClick={() => {
                    if (newRowSaveDisabled) {
                      return;
                    }

                    props.onCreateInlineTransaction({
                      amount: newTransactionDraft.amount.trim(),
                      date: newTransactionDraft.date.trim(),
                      description: newTransactionDraft.description.trim(),
                      expenseAccountId: newTransactionDraft.expenseAccountId.trim(),
                      payee: newTransactionDraft.payee.trim(),
                      status: newTransactionDraft.status,
                    });
                    setNewTransactionDraft((current) => ({
                      ...current,
                      amount: "0.00",
                      description: "",
                      payee: "",
                      status: "open",
                    }));
                  }}
                >
                  {props.busy === "Transaction post" ? "Posting..." : "Post"}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        {props.isFiltered ? (
          <p className="form-hint">
            showing {props.ledgerBook.filteredTransactions.length} of {props.totalCount}
          </p>
        ) : null}
      </article>

      <article className="panel">
        <div className="panel-header">
          <span>Balances</span>
          <span className="muted">As of {balanceAsOfDate}</span>
        </div>
        {props.ledgerBook.filteredBalances.map((balance) => (
          <button
            key={`${balance.accountId}:${balance.commodityCode}`}
            className={`metric-button${props.selectedLedgerAccountId === balance.accountId ? " active" : ""}`}
            type="button"
            onClick={() =>
              props.setSelectedLedgerAccountId((current) =>
                current === balance.accountId ? null : balance.accountId,
              )
            }
          >
            <span>{balance.accountName}</span>
            <strong>{props.formatCurrency(balance.balance)}</strong>
          </button>
        ))}
      </article>
    </>
  );
}
