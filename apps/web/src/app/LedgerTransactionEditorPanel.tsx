import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { BookResponse } from "./api";
import {
  getAccountSearchMatches,
  getNextPostingFocusTarget,
  getPostingBalanceSummary,
  getPreferredAccountTypesForPostingAmount,
  getTransactionEditorHotkeyAction,
  type PostingFocusField,
  type createLedgerBookModel,
} from "./shell";
import { formatSignedCurrency, formatTransactionStatus } from "./app-format";
import type { TransactionEditorState } from "./transaction-editor";

interface LedgerTransactionEditorPanelProps {
  activePostingAccountSearchIndex: number | null;
  addPostingToEditor: () => void;
  busy: string | null;
  highlightedPostingAccountMatchIndex: number;
  ledgerBook: ReturnType<typeof createLedgerBookModel>;
  movePosting: (direction: "up" | "down", postingIndex: number) => void;
  pendingPostingFocusTargetSetter: Dispatch<
    SetStateAction<{
      field: PostingFocusField;
      focusIndex: number;
    } | null>
  >;
  postingAccountInputRefs: MutableRefObject<Array<HTMLInputElement | null>>;
  postingAmountInputRefs: MutableRefObject<Array<HTMLInputElement | null>>;
  postingMemoInputRefs: MutableRefObject<Array<HTMLInputElement | null>>;
  postingBalanceSummary: ReturnType<typeof getPostingBalanceSummary>;
  resetTransactionEditorDraft: () => void;
  saveTransactionEditor: () => Promise<void>;
  selectPostingAccount: (index: number, accountId: string) => void;
  setActivePostingAccountSearchIndex: Dispatch<SetStateAction<number | null>>;
  setHighlightedPostingAccountMatchIndex: Dispatch<SetStateAction<number>>;
  setTransactionEditor: Dispatch<SetStateAction<TransactionEditorState | null>>;
  transactionEditor: TransactionEditorState | null;
  transactionEditorErrors: string[];
  updatePostingAccountSearch: (index: number, query: string) => void;
  bookAccounts: BookResponse["book"]["accounts"];
}

export function LedgerTransactionEditorPanel(props: LedgerTransactionEditorPanelProps) {
  const {
    activePostingAccountSearchIndex,
    addPostingToEditor,
    busy,
    highlightedPostingAccountMatchIndex,
    ledgerBook,
    movePosting,
    pendingPostingFocusTargetSetter,
    postingAccountInputRefs,
    postingAmountInputRefs,
    postingMemoInputRefs,
    postingBalanceSummary,
    resetTransactionEditorDraft,
    saveTransactionEditor,
    selectPostingAccount,
    setActivePostingAccountSearchIndex,
    setHighlightedPostingAccountMatchIndex,
    setTransactionEditor,
    transactionEditor,
    transactionEditorErrors,
    updatePostingAccountSearch,
    bookAccounts,
  } = props;

  return (
    <article className="panel ledger-detail-panel">
      <div className="panel-header">
        <span>Register detail</span>
        <span className="muted">
          {ledgerBook.selectedTransaction?.id ?? "Select a register row"}
        </span>
      </div>
      {transactionEditor && ledgerBook.selectedTransaction ? (
        <div className="ledger-detail-layout">
          <div className="ledger-detail-summary">
            <div className="detail-stack">
              <div className="status-item">
                <span>Description</span>
                <strong>{ledgerBook.selectedTransaction.description}</strong>
              </div>
              <div className="status-item">
                <span>Occurred on</span>
                <strong>{ledgerBook.selectedTransaction.occurredOn}</strong>
              </div>
              <div className="status-item">
                <span>Payee</span>
                <strong>{ledgerBook.selectedTransaction.payee ?? "Unassigned"}</strong>
              </div>
              <div className="status-item">
                <span>Split count</span>
                <strong>{ledgerBook.selectedTransaction.postings.length}</strong>
              </div>
              <div className="status-item">
                <span>Tags</span>
                <strong>
                  {ledgerBook.selectedTransaction.tags.length > 0
                    ? ledgerBook.selectedTransaction.tags.join(", ")
                    : "None"}
                </strong>
              </div>
              <div className="status-item">
                <span>Status</span>
                <strong>{formatTransactionStatus(ledgerBook.selectedTransaction.status)}</strong>
              </div>
            </div>
            <div className="detail-stack">
              {ledgerBook.selectedTransaction.postings.map((posting) => (
                <div
                  key={`${ledgerBook.selectedTransaction?.id}:${posting.accountId}:${posting.amount}`}
                  className="posting-summary-row"
                >
                  <div>
                    <strong>{posting.accountName}</strong>
                    <div className="candidate-meta">
                      {posting.memo ?? "No memo"}
                      {posting.cleared ? " · cleared" : " · open"}
                    </div>
                  </div>
                  <strong>{formatSignedCurrency(posting.amount)}</strong>
                </div>
              ))}
            </div>
          </div>
          <form
            className="form-stack ledger-detail-form"
            onKeyDown={(event) => {
              const action = getTransactionEditorHotkeyAction({
                ctrlKey: event.ctrlKey,
                key: event.key,
                metaKey: event.metaKey,
              });

              if (action === "reset") {
                event.preventDefault();
                resetTransactionEditorDraft();
                return;
              }

              if (action === "save") {
                event.preventDefault();
                void saveTransactionEditor();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void saveTransactionEditor();
            }}
          >
            <label>
              Description
              <input
                value={transactionEditor.description}
                onChange={(event) =>
                  setTransactionEditor((current) =>
                    current ? { ...current, description: event.target.value } : current,
                  )
                }
              />
            </label>
            <div className="form-inline">
              <label>
                Occurred on
                <input
                  value={transactionEditor.occurredOn}
                  onChange={(event) =>
                    setTransactionEditor((current) =>
                      current ? { ...current, occurredOn: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                Payee
                <input
                  value={transactionEditor.payee}
                  onChange={(event) =>
                    setTransactionEditor((current) =>
                      current ? { ...current, payee: event.target.value } : current,
                    )
                  }
                />
              </label>
            </div>
            <label>
              Tags
              <input
                value={transactionEditor.tags}
                placeholder="comma-separated"
                onChange={(event) =>
                  setTransactionEditor((current) =>
                    current ? { ...current, tags: event.target.value } : current,
                  )
                }
              />
            </label>
            <div className="detail-stack">
              {transactionEditor.postings.map((posting, index) => {
                const accountMatches = getAccountSearchMatches({
                  accounts: bookAccounts,
                  preferredAccountTypes: getPreferredAccountTypesForPostingAmount(posting.amount),
                  query: posting.accountQuery,
                  selectedAccountId: posting.accountId,
                });
                const highlightedMatch =
                  accountMatches[
                    Math.min(highlightedPostingAccountMatchIndex, Math.max(accountMatches.length - 1, 0))
                  ] ?? null;

                return (
                  <div key={`${transactionEditor.transactionId}:posting:${index}`} className="posting-card">
                    <div className="form-inline">
                      <label className="account-search-field">
                        Account
                        <input
                          ref={(element) => {
                            postingAccountInputRefs.current[index] = element;
                          }}
                          value={posting.accountQuery}
                          placeholder="Search by name, code, or id"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={activePostingAccountSearchIndex === index}
                          aria-controls={`posting-account-options-${index}`}
                          onFocus={() => {
                            setActivePostingAccountSearchIndex(index);
                            setHighlightedPostingAccountMatchIndex(0);
                          }}
                          onBlur={() => {
                            setActivePostingAccountSearchIndex((current) =>
                              current === index ? null : current,
                            );
                          }}
                          onKeyDown={(event) => {
                            if (event.altKey && event.key === "ArrowUp") {
                              event.preventDefault();
                              movePosting("up", index);
                              return;
                            }

                            if (event.altKey && event.key === "ArrowDown") {
                              event.preventDefault();
                              movePosting("down", index);
                              return;
                            }

                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              setActivePostingAccountSearchIndex(index);
                              setHighlightedPostingAccountMatchIndex((current) =>
                                Math.min(current + 1, Math.max(accountMatches.length - 1, 0)),
                              );
                              return;
                            }

                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              setActivePostingAccountSearchIndex(index);
                              setHighlightedPostingAccountMatchIndex((current) => Math.max(current - 1, 0));
                              return;
                            }

                            if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.shiftKey) {
                              if (event.key === "Escape") {
                                setActivePostingAccountSearchIndex(null);
                              }
                              return;
                            }

                            event.preventDefault();

                            if (highlightedMatch) {
                              selectPostingAccount(index, highlightedMatch.account.id);
                            } else if (!posting.accountId.trim()) {
                              return;
                            }

                            const nextTarget = getNextPostingFocusTarget({
                              field: "account",
                              postingCount: transactionEditor.postings.length,
                              postingIndex: index,
                            });
                            pendingPostingFocusTargetSetter({
                              field: nextTarget.field,
                              focusIndex: nextTarget.focusIndex,
                            });
                          }}
                          onChange={(event) =>
                            updatePostingAccountSearch(index, event.target.value)
                          }
                        />
                        {activePostingAccountSearchIndex === index ? (
                          <div
                            id={`posting-account-options-${index}`}
                            className="account-search-menu"
                            role="listbox"
                          >
                            {accountMatches.length > 0 ? (
                              accountMatches.map((match, matchIndex) => (
                                <button
                                  key={match.account.id}
                                  className={`account-search-option${
                                    matchIndex === highlightedPostingAccountMatchIndex ? " active" : ""
                                  }`}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectPostingAccount(index, match.account.id);
                                    pendingPostingFocusTargetSetter({
                                      field: "amount",
                                      focusIndex: index,
                                    });
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
                              <div className="account-search-empty">No matching accounts.</div>
                            )}
                          </div>
                        ) : null}
                      </label>
                      <label>
                        Signed amount
                        <input
                          ref={(element) => {
                            postingAmountInputRefs.current[index] = element;
                          }}
                          value={posting.amount}
                          onKeyDown={(event) => {
                            if (event.altKey && event.key === "ArrowUp") {
                              event.preventDefault();
                              movePosting("up", index);
                              return;
                            }

                            if (event.altKey && event.key === "ArrowDown") {
                              event.preventDefault();
                              movePosting("down", index);
                              return;
                            }

                            if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.shiftKey) {
                              return;
                            }

                            event.preventDefault();
                            const nextTarget = getNextPostingFocusTarget({
                              field: "amount",
                              postingCount: transactionEditor.postings.length,
                              postingIndex: index,
                            });

                            if (nextTarget.addPosting) {
                              addPostingToEditor();
                              return;
                            }

                            pendingPostingFocusTargetSetter({
                              field: nextTarget.field,
                              focusIndex: nextTarget.focusIndex,
                            });
                          }}
                          onChange={(event) =>
                            setTransactionEditor((current) =>
                              current
                                ? {
                                    ...current,
                                    postings: current.postings.map((candidate, candidateIndex) =>
                                      candidateIndex === index ? { ...candidate, amount: event.target.value } : candidate,
                                    ),
                                  }
                                : current,
                            )
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Memo
                      <input
                        ref={(element) => {
                          postingMemoInputRefs.current[index] = element;
                        }}
                        value={posting.memo}
                        onKeyDown={(event) => {
                          if (event.altKey && event.key === "ArrowUp") {
                            event.preventDefault();
                            movePosting("up", index);
                            return;
                          }

                          if (event.altKey && event.key === "ArrowDown") {
                            event.preventDefault();
                            movePosting("down", index);
                            return;
                          }

                          if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.shiftKey) {
                            return;
                          }

                          event.preventDefault();
                          const nextTarget = getNextPostingFocusTarget({
                            field: "memo",
                            postingCount: transactionEditor.postings.length,
                            postingIndex: index,
                          });

                          if (nextTarget.addPosting) {
                            addPostingToEditor();
                            return;
                          }

                          pendingPostingFocusTargetSetter({
                            field: nextTarget.field,
                            focusIndex: nextTarget.focusIndex,
                          });
                        }}
                        onChange={(event) =>
                          setTransactionEditor((current) =>
                            current
                              ? {
                                  ...current,
                                  postings: current.postings.map((candidate, candidateIndex) =>
                                    candidateIndex === index ? { ...candidate, memo: event.target.value } : candidate,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <div className="posting-editor-row">
                      <div className="posting-reorder-row">
                        <button type="button" onClick={() => movePosting("up", index)}>
                          Move up
                        </button>
                        <button type="button" onClick={() => movePosting("down", index)}>
                          Move down
                        </button>
                      </div>
                      <label className="checkbox-row">
                        <input
                          checked={posting.cleared}
                          type="checkbox"
                          onChange={(event) =>
                            setTransactionEditor((current) =>
                              current
                                ? {
                                    ...current,
                                    postings: current.postings.map((candidate, candidateIndex) =>
                                      candidateIndex === index ? { ...candidate, cleared: event.target.checked } : candidate,
                                    ),
                                  }
                                : current,
                            )
                          }
                        />
                        <span>Cleared</span>
                      </label>
                      <button
                        disabled={transactionEditor.postings.length <= 2}
                        type="button"
                        onClick={() => {
                          setTransactionEditor((current) =>
                            current
                              ? {
                                  ...current,
                                  postings: current.postings.filter(
                                    (_, candidateIndex) => candidateIndex !== index,
                                  ),
                                }
                              : current,
                          );
                          setActivePostingAccountSearchIndex((current) => {
                            if (current === null) {
                              return current;
                            }

                            if (current === index) {
                              return null;
                            }

                            return current > index ? current - 1 : current;
                          });
                        }}
                      >
                        Remove posting
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => addPostingToEditor()}>
              Add posting
            </button>
            <p className="form-hint">
              Shortcuts: `Ctrl/Cmd+S` save, `Ctrl/Cmd+Enter` save, `Esc` reset, `Enter` advances
              across posting fields, `Alt+Up/Down` reorders the current split
            </p>
            {transactionEditorErrors.length > 0 ? (
              <div className="editor-balance-callout warning">
                <div className="editor-balance-callout-header">
                  <strong>Transaction out of balance</strong>
                  <span>
                    Remaining difference:{" "}
                    {postingBalanceSummary.balance === null
                      ? "invalid amount"
                      : formatSignedCurrency(postingBalanceSummary.balance)}
                  </span>
                </div>
                <div className="error-stack">
                  {transactionEditorErrors.map((issue) => (
                    <p key={issue} className="form-hint error-text">
                      {issue}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="editor-balance-callout balanced">
                <div className="editor-balance-callout-header">
                  <strong>Transaction balanced</strong>
                  <span>
                    Difference:{" "}
                    {postingBalanceSummary.balance === null
                      ? "invalid amount"
                      : formatSignedCurrency(postingBalanceSummary.balance)}
                  </span>
                </div>
              </div>
            )}
            <div className="posting-meta">
              <span>Transaction id</span>
              <span>{transactionEditor.transactionId}</span>
            </div>
            <div className="posting-editor-row">
              <button type="button" onClick={() => resetTransactionEditorDraft()}>
                Reset draft
              </button>
              <button type="submit" disabled={busy !== null || transactionEditorErrors.length > 0}>
                {busy === "Transaction update" ? "Saving..." : "Save transaction"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="ledger-detail-empty">
          <p>Select a register row to open a full transaction detail pane.</p>
          <p className="form-hint">
            The detail pane supports inline split edits, keyboard navigation, reordering, and
            audited save back through the service route.
          </p>
        </div>
      )}
    </article>
  );
}
