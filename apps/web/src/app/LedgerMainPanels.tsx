import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { WorkspaceResponse } from "./api";
import { LedgerOperationsPanels } from "./LedgerOperationsPanels";
import { LedgerRegisterPanel } from "./LedgerRegisterPanel";
import type { LedgerInlineRowEditDraft } from "./ledger-state";
import type { createLedgerWorkspaceModel, createReconciliationWorkspaceModel } from "./shell";

interface LedgerMainPanelsProps {
  activeLedgerRegisterTabId: string;
  busy: string | null;
  expenseAccounts: WorkspaceResponse["workspace"]["accounts"];
  formatCurrency: (amount: number) => string;
  formatTransactionStatus: (status: "cleared" | "open" | "reconciled") => string;
  inlineEditDraft: LedgerInlineRowEditDraft | null;
  inlineEditingTransactionId: string | null;
  isLedgerDetailOpen: boolean;
  isLedgerOperationsOpen: boolean;
  ledgerRange: { from: string; to: string };
  ledgerRegisterTabs: Array<{
    accountId: string | null;
    id: string;
    label: string;
  }>;
  ledgerSearchInputRef: RefObject<HTMLInputElement | null>;
  ledgerSearchText: string;
  ledgerStatusFilter: "all" | "cleared" | "open" | "reconciled";
  ledgerWorkspace: ReturnType<typeof createLedgerWorkspaceModel>;
  liquidAccounts: WorkspaceResponse["workspace"]["accounts"];
  onActivateLedgerRegisterTab: (tabId: string) => void;
  onCancelInlineEdit: () => void;
  onCloseLedgerRegisterTab: (tabId: string) => void;
  onCreateInlineTransaction: (draft: {
    amount: string;
    date: string;
    description: string;
    expenseAccountId: string;
    payee: string;
  }) => void;
  onDeleteInlineTransaction: (transactionId: string) => void;
  onMoveLedgerRegisterTab: (direction: "left" | "right", tabId: string) => void;
  onOpenAdvancedEditor: () => void;
  onOpenLinkedRegisterTabs: (transactionId: string) => void;
  onOpenLedgerRegisterTabForAccount: (accountId: string) => void;
  onSaveInlineEdit: (transactionId: string) => void;
  onSaveInlineSplitEdit: (input: {
    splits: Array<{
      accountId: string;
      accountQuery: string;
      amount: string;
      cleared: boolean;
      commodityCode: string;
      memo: string;
    }>;
    transactionId: string;
  }) => void;
  onStartInlineEdit: (
    transaction: ReturnType<typeof createLedgerWorkspaceModel>["filteredTransactions"][number],
  ) => void;
  onToggleLedgerDetailOpen: () => void;
  onToggleLedgerOperationsOpen: () => void;
  onUpdateInlineEditField: (field: keyof LedgerInlineRowEditDraft, value: string) => void;
  reconciliationForm: {
    accountId: string;
    statementBalance: string;
    statementDate: string;
  };
  reconciliationWorkspace: ReturnType<typeof createReconciliationWorkspaceModel>;
  runMutation: (label: string, operation: () => Promise<void>) => Promise<void>;
  selectedLedgerAccountId: string | null;
  selectedLedgerTransactionId: string | null;
  setLedgerRange: Dispatch<SetStateAction<{ from: string; to: string }>>;
  setLedgerSearchText: Dispatch<SetStateAction<string>>;
  setLedgerStatusFilter: Dispatch<SetStateAction<"all" | "cleared" | "open" | "reconciled">>;
  setReconciliationForm: Dispatch<
    SetStateAction<{
      accountId: string;
      statementBalance: string;
      statementDate: string;
    }>
  >;
  setSelectedLedgerAccountId: Dispatch<SetStateAction<string | null>>;
  setSelectedLedgerTransactionId: Dispatch<SetStateAction<string | null>>;
  setSelectedReconciliationTransactionIds: Dispatch<SetStateAction<Record<string, boolean>>>;
  transactionEditorPanel: ReactNode;
}

export function LedgerMainPanels(props: LedgerMainPanelsProps) {
  return (
    <>
      <LedgerRegisterPanel
        activeLedgerRegisterTabId={props.activeLedgerRegisterTabId}
        busy={props.busy}
        expenseAccounts={props.expenseAccounts}
        formatCurrency={props.formatCurrency}
        formatTransactionStatus={props.formatTransactionStatus}
        inlineEditDraft={props.inlineEditDraft}
        inlineEditingTransactionId={props.inlineEditingTransactionId}
        ledgerRange={props.ledgerRange}
        ledgerRegisterTabs={props.ledgerRegisterTabs}
        ledgerSearchInputRef={props.ledgerSearchInputRef}
        ledgerSearchText={props.ledgerSearchText}
        ledgerStatusFilter={props.ledgerStatusFilter}
        ledgerWorkspace={props.ledgerWorkspace}
        liquidAccounts={props.liquidAccounts}
        onActivateLedgerRegisterTab={props.onActivateLedgerRegisterTab}
        onCancelInlineEdit={props.onCancelInlineEdit}
        onCloseLedgerRegisterTab={props.onCloseLedgerRegisterTab}
        onCreateInlineTransaction={props.onCreateInlineTransaction}
        onDeleteInlineTransaction={props.onDeleteInlineTransaction}
        onMoveLedgerRegisterTab={props.onMoveLedgerRegisterTab}
        onOpenAdvancedEditor={props.onOpenAdvancedEditor}
        onOpenLedgerRegisterTabForAccount={props.onOpenLedgerRegisterTabForAccount}
        onOpenLinkedRegisterTabs={props.onOpenLinkedRegisterTabs}
        onSaveInlineEdit={props.onSaveInlineEdit}
        onSaveInlineSplitEdit={props.onSaveInlineSplitEdit}
        onStartInlineEdit={props.onStartInlineEdit}
        onUpdateInlineEditField={props.onUpdateInlineEditField}
        selectedLedgerAccountId={props.selectedLedgerAccountId}
        selectedLedgerTransactionId={props.selectedLedgerTransactionId}
        setLedgerRange={props.setLedgerRange}
        setLedgerSearchText={props.setLedgerSearchText}
        setLedgerStatusFilter={props.setLedgerStatusFilter}
        setSelectedLedgerAccountId={props.setSelectedLedgerAccountId}
        setSelectedLedgerTransactionId={props.setSelectedLedgerTransactionId}
      />

      {props.isLedgerDetailOpen ? (
        <>
          <div className="posting-editor-row">
            <button type="button" onClick={props.onToggleLedgerDetailOpen}>
              Hide advanced editor
            </button>
          </div>
          {props.transactionEditorPanel}
        </>
      ) : (
        <article className="panel">
          <div className="panel-header">
            <span>Advanced editor</span>
            <span className="muted">Optional</span>
          </div>
          <p className="form-hint">
            Inline row editing is the default. Use the row-level Advanced action only when you need
            split-level editing details.
          </p>
        </article>
      )}
      <article className="panel">
        <div className="panel-header">
          <span>Ledger operations</span>
          <span className="muted">Reconciliation and statement matching</span>
        </div>
        <div className="posting-editor-row">
          <button type="button" onClick={props.onToggleLedgerOperationsOpen}>
            {props.isLedgerOperationsOpen ? "Hide reconciliation workspace" : "Open reconciliation workspace"}
          </button>
        </div>
        {props.isLedgerOperationsOpen ? (
          <LedgerOperationsPanels
            busy={props.busy}
            liquidAccounts={props.liquidAccounts}
            reconciliationForm={props.reconciliationForm}
            reconciliationWorkspace={props.reconciliationWorkspace}
            runMutation={props.runMutation}
            setReconciliationForm={props.setReconciliationForm}
            setSelectedReconciliationTransactionIds={props.setSelectedReconciliationTransactionIds}
          />
        ) : (
          <p className="form-hint">
            Reconciliation is available on demand so routine editing stays register-first.
          </p>
        )}
      </article>
    </>
  );
}
