import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Account, Transaction } from "@tally-core/domain";
import type { ReconciliationSession } from "@tally-core/workspace";

export interface ReconciliationFormValue {
  accountId: string;
  reconciliationId: string;
  statementBalance: string;
  statementDate: string;
}

interface ReconciliationCaptureProps {
  accounts: Account[];
  busy: boolean;
  form: ReconciliationFormValue;
  reconciliationSessions: ReconciliationSession[];
  selectedTransactionIds: Record<string, boolean>;
  transactions: Transaction[];
  onAccountChange: (accountId: string) => void;
  onFormChange: (patch: Partial<ReconciliationFormValue>) => void;
  onSubmit: () => void;
  onToggleTransaction: (transactionId: string) => void;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    currency: "USD",
    style: "currency",
  });
}

function formatSignedCurrency(amount: number): string {
  const formatted = formatCurrency(Math.abs(amount));
  return amount < 0 ? `-${formatted}` : formatted;
}

function getTransactionAmountForAccount(transaction: Transaction, accountId: string): number {
  return transaction.postings
    .filter((posting) => posting.accountId === accountId)
    .reduce((sum, posting) => sum + posting.amount.quantity, 0);
}

export function ReconciliationCapture(props: ReconciliationCaptureProps) {
  const reconciliationAccounts = props.accounts.filter(
    (account) => account.type === "asset" || account.type === "liability",
  );
  const selectedReconciliationAccount =
    reconciliationAccounts.find((account) => account.id === props.form.accountId) ?? reconciliationAccounts[0];
  const reconciliationTransactions = selectedReconciliationAccount
    ? props.transactions
        .filter(
          (transaction) =>
            transaction.occurredOn <= props.form.statementDate.trim() &&
            transaction.postings.some((posting) => posting.accountId === selectedReconciliationAccount.id),
        )
        .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn))
    : [];
  const clearedBalance = selectedReconciliationAccount
    ? reconciliationTransactions.reduce((sum, transaction) => {
        if (!props.selectedTransactionIds[transaction.id]) {
          return sum;
        }

        return sum + getTransactionAmountForAccount(transaction, selectedReconciliationAccount.id);
      }, 0)
    : 0;
  const statementBalance = Number.parseFloat(props.form.statementBalance);
  const reconciliationDifference = Number.isFinite(statementBalance)
    ? statementBalance - clearedBalance
    : null;
  const latestReconciliationSession = selectedReconciliationAccount
    ? [...props.reconciliationSessions]
        .filter((session) => session.accountId === selectedReconciliationAccount.id)
        .sort((left, right) => right.statementDate.localeCompare(left.statementDate))[0]
    : undefined;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Reconciliation capture</Text>
      <Text style={styles.note}>
        Select a statement account, mark cleared transactions, and capture the current statement difference through
        the same reconciliation route used by the desktop shell.
      </Text>
      <View style={styles.schedulePicker}>
        {reconciliationAccounts.map((account) => (
          <Pressable
            key={account.id}
            onPress={() => props.onAccountChange(account.id)}
            style={[styles.scheduleChip, props.form.accountId === account.id && styles.scheduleChipActive]}
          >
            <Text
              style={[
                styles.scheduleChipLabel,
                props.form.accountId === account.id && styles.scheduleChipLabelActive,
              ]}
            >
              {account.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Account ID</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={false}
          placeholder="acct-checking"
          placeholderTextColor="#7b7c73"
          style={[styles.input, styles.inputDisabled]}
          value={selectedReconciliationAccount?.id ?? ""}
        />
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.fieldColumn}>
          <Text style={styles.label}>Statement date</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(statementDate) => props.onFormChange({ statementDate })}
            placeholder="2026-04-30"
            placeholderTextColor="#7b7c73"
            style={styles.input}
            value={props.form.statementDate}
          />
        </View>
        <View style={styles.fieldColumn}>
          <Text style={styles.label}>Statement balance</Text>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={(statementBalance) => props.onFormChange({ statementBalance })}
            placeholder="3051.58"
            placeholderTextColor="#7b7c73"
            style={styles.input}
            value={props.form.statementBalance}
          />
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Reconciliation ID</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(reconciliationId) => props.onFormChange({ reconciliationId })}
          placeholder="Optional override"
          placeholderTextColor="#7b7c73"
          style={styles.input}
          value={props.form.reconciliationId}
        />
      </View>
      {latestReconciliationSession ? (
        <View style={styles.exceptionBox}>
          <Text style={styles.label}>Latest captured session</Text>
          <Text style={styles.note}>
            {latestReconciliationSession.statementDate} with difference{" "}
            {formatSignedCurrency(latestReconciliationSession.difference.quantity)}
          </Text>
        </View>
      ) : null}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, styles.summaryLight]}>
          <Text style={styles.summaryLabel}>Cleared total</Text>
          <Text style={styles.summaryValue}>{formatSignedCurrency(clearedBalance)}</Text>
        </View>
        <View
          style={[
            styles.summaryCard,
            reconciliationDifference === 0 ? styles.summaryDark : styles.summaryWarn,
          ]}
        >
          <Text style={styles.summaryLabelDark}>Difference</Text>
          <Text style={styles.summaryValueDark}>
            {reconciliationDifference === null ? "Enter balance" : formatSignedCurrency(reconciliationDifference)}
          </Text>
        </View>
      </View>
      <View style={styles.cardInset}>
        <Text style={styles.label}>Cleared transactions</Text>
        {reconciliationTransactions.map((transaction) => (
          <Pressable
            key={transaction.id}
            onPress={() => props.onToggleTransaction(transaction.id)}
            style={[
              styles.reconciliationRow,
              props.selectedTransactionIds[transaction.id] && styles.reconciliationRowActive,
            ]}
          >
            <View style={styles.reconciliationRowBody}>
              <Text style={styles.metricLabel}>{transaction.description}</Text>
              <Text style={styles.metricHint}>
                {transaction.occurredOn}
                {transaction.payee ? ` · ${transaction.payee}` : ""}
              </Text>
            </View>
            <View style={styles.reconciliationRowMeta}>
              <Text style={styles.metricValue}>
                {selectedReconciliationAccount
                  ? formatSignedCurrency(
                      getTransactionAmountForAccount(transaction, selectedReconciliationAccount.id),
                    )
                  : formatSignedCurrency(0)}
              </Text>
              <Text style={styles.reconciliationToggle}>
                {props.selectedTransactionIds[transaction.id] ? "Cleared" : "Open"}
              </Text>
            </View>
          </Pressable>
        ))}
        {!reconciliationTransactions.length ? (
          <Text style={styles.note}>No transactions are available for the selected account and statement date.</Text>
        ) : null}
      </View>
      <Pressable
        disabled={props.busy || !selectedReconciliationAccount}
        onPress={props.onSubmit}
        style={[styles.primaryButton, (props.busy || !selectedReconciliationAccount) && styles.buttonDisabled]}
      >
        <Text style={styles.primaryButtonLabel}>
          {props.busy ? "Saving..." : "Record reconciliation"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffaf1",
    borderRadius: 24,
    gap: 14,
    padding: 18,
  },
  sectionTitle: {
    color: "#1f2321",
    fontSize: 20,
    fontWeight: "700",
  },
  note: {
    color: "#5f675f",
    fontSize: 13,
    lineHeight: 18,
  },
  schedulePicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scheduleChip: {
    backgroundColor: "#f3ebdb",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scheduleChipActive: {
    backgroundColor: "#1f2321",
  },
  scheduleChipLabel: {
    color: "#3f463f",
    fontSize: 13,
    fontWeight: "600",
  },
  scheduleChipLabelActive: {
    color: "#fdf8ef",
  },
  field: {
    gap: 6,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 10,
  },
  fieldColumn: {
    flex: 1,
    gap: 6,
  },
  label: {
    color: "#3f463f",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#f3ebdb",
    borderRadius: 16,
    color: "#1f2321",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputDisabled: {
    color: "#6d746d",
  },
  exceptionBox: {
    backgroundColor: "#f3ebdb",
    borderRadius: 18,
    gap: 12,
    padding: 14,
  },
  summaryRow: {
    gap: 14,
  },
  summaryCard: {
    borderRadius: 24,
    padding: 18,
  },
  summaryLight: {
    backgroundColor: "#f3ebdb",
  },
  summaryDark: {
    backgroundColor: "#123530",
  },
  summaryWarn: {
    backgroundColor: "#734128",
  },
  summaryLabel: {
    color: "#5f675f",
    fontSize: 13,
    textTransform: "uppercase",
  },
  summaryValue: {
    color: "#1f2321",
    fontSize: 28,
    fontWeight: "700",
    marginTop: 8,
  },
  summaryLabelDark: {
    color: "#9ec5bf",
    fontSize: 13,
    textTransform: "uppercase",
  },
  summaryValueDark: {
    color: "#fdf8ef",
    fontSize: 28,
    fontWeight: "700",
    marginTop: 8,
  },
  cardInset: {
    backgroundColor: "#f3ebdb",
    borderRadius: 18,
    gap: 10,
    padding: 14,
  },
  reconciliationRow: {
    alignItems: "center",
    backgroundColor: "#fffaf1",
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reconciliationRowActive: {
    borderColor: "#006b5f",
    borderWidth: 1,
  },
  reconciliationRowBody: {
    flex: 1,
  },
  reconciliationRowMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  reconciliationToggle: {
    color: "#5f675f",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metricLabel: {
    color: "#1f2321",
    fontSize: 16,
    fontWeight: "600",
  },
  metricHint: {
    color: "#5f675f",
    fontSize: 13,
    marginTop: 3,
  },
  metricValue: {
    color: "#006b5f",
    fontSize: 16,
    fontWeight: "700",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#006b5f",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonLabel: {
    color: "#fdf8ef",
    fontSize: 15,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
