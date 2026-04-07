import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Account } from "@tally/domain";

interface SchedulePostingFormValue {
  accountId: string;
  accountSearch: string;
  amount: string;
  memo: string;
}

interface SchedulePostingEditorProps {
  accounts: Account[];
  busy: boolean;
  canRemove: boolean;
  lineNumber: number;
  posting: SchedulePostingFormValue;
  onAccountChange: (accountId: string) => void;
  onAmountChange: (amount: string) => void;
  onMemoChange: (memo: string) => void;
  onRemove: () => void;
  onSearchChange: (search: string) => void;
}

function getSuggestedScheduleAccounts(
  accounts: Account[],
  posting: SchedulePostingFormValue,
): {
  recommendedAccounts: Account[];
  secondaryAccounts: Account[];
} {
  const quantity = Number.parseFloat(posting.amount);
  const preferredTypes =
    Number.isFinite(quantity) && quantity < 0
      ? new Set<Account["type"]>(["asset", "liability", "equity", "income"])
      : new Set<Account["type"]>(["expense", "asset"]);

  const recommendedAccounts = accounts.filter(
    (account) => preferredTypes.has(account.type) || account.id === posting.accountId,
  );
  const secondaryAccounts = accounts.filter(
    (account) => !preferredTypes.has(account.type) && account.id !== posting.accountId,
  );

  return {
    recommendedAccounts,
    secondaryAccounts,
  };
}

function filterAccounts(accounts: Account[], search: string): Account[] {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) {
    return accounts;
  }

  return accounts.filter((account) =>
    [account.name, account.id, account.type].some((value) => value.toLowerCase().includes(normalizedSearch)),
  );
}

export function SchedulePostingEditor(props: SchedulePostingEditorProps) {
  const suggestedAccounts = getSuggestedScheduleAccounts(props.accounts, props.posting);
  const filteredRecommendedAccounts = filterAccounts(
    suggestedAccounts.recommendedAccounts,
    props.posting.accountSearch,
  );
  const filteredSecondaryAccounts = filterAccounts(
    suggestedAccounts.secondaryAccounts,
    props.posting.accountSearch,
  );
  const selectedAccount =
    props.accounts.find((account) => account.id === props.posting.accountId)?.name ?? props.posting.accountId;

  return (
    <View style={styles.postingEditor}>
      <View style={styles.field}>
        <Text style={styles.label}>Account</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={false}
          placeholder="Select an account"
          placeholderTextColor="#7b7c73"
          style={[styles.input, styles.inputDisabled]}
          value={selectedAccount}
        />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={props.onSearchChange}
          placeholder="Search accounts by name, id, or type"
          placeholderTextColor="#7b7c73"
          style={styles.input}
          value={props.posting.accountSearch}
        />
        <Text style={styles.accountSectionLabel}>Recommended</Text>
        <View style={styles.accountChipGrid}>
          {filteredRecommendedAccounts.map((account) => (
            <Pressable
              key={`${props.lineNumber}:${account.id}`}
              onPress={() => props.onAccountChange(account.id)}
              style={[
                styles.accountChip,
                props.posting.accountId === account.id && styles.accountChipActive,
              ]}
            >
              <Text
                style={[
                  styles.accountChipLabel,
                  props.posting.accountId === account.id && styles.accountChipLabelActive,
                ]}
              >
                {account.name}
              </Text>
              <Text
                style={[
                  styles.accountChipMeta,
                  props.posting.accountId === account.id && styles.accountChipMetaActive,
                ]}
              >
                {account.type}
              </Text>
            </Pressable>
          ))}
        </View>
        {!filteredRecommendedAccounts.length ? (
          <Text style={styles.note}>No recommended accounts match this search.</Text>
        ) : null}
        {filteredSecondaryAccounts.length ? (
          <>
            <Text style={styles.accountSectionLabel}>Other accounts</Text>
            <View style={styles.accountChipGrid}>
              {filteredSecondaryAccounts.map((account) => (
                <Pressable
                  key={`${props.lineNumber}:other:${account.id}`}
                  onPress={() => props.onAccountChange(account.id)}
                  style={[
                    styles.accountChip,
                    props.posting.accountId === account.id && styles.accountChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.accountChipLabel,
                      props.posting.accountId === account.id && styles.accountChipLabelActive,
                    ]}
                  >
                    {account.name}
                  </Text>
                  <Text
                    style={[
                      styles.accountChipMeta,
                      props.posting.accountId === account.id && styles.accountChipMetaActive,
                    ]}
                  >
                    {account.type}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        {!filteredRecommendedAccounts.length && !filteredSecondaryAccounts.length ? (
          <Text style={styles.note}>No accounts match this search.</Text>
        ) : null}
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.fieldColumn}>
          <Text style={styles.label}>Signed amount</Text>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={props.onAmountChange}
            placeholder="1400 or -1400"
            placeholderTextColor="#7b7c73"
            style={styles.input}
            value={props.posting.amount}
          />
        </View>
        <View style={styles.fieldColumn}>
          <Text style={styles.label}>Memo</Text>
          <TextInput
            onChangeText={props.onMemoChange}
            placeholder="Optional memo"
            placeholderTextColor="#7b7c73"
            style={styles.input}
            value={props.posting.memo}
          />
        </View>
      </View>
      <View style={styles.postingEditorFooter}>
        <Text style={styles.metricHint}>Line {props.lineNumber}</Text>
        <Pressable
          disabled={!props.canRemove}
          onPress={props.onRemove}
          style={[styles.tertiaryButton, (!props.canRemove || props.busy) && styles.buttonDisabled]}
        >
          <Text style={styles.tertiaryButtonLabel}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  postingEditor: {
    backgroundColor: "#fffaf1",
    borderRadius: 16,
    gap: 10,
    padding: 12,
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
  note: {
    color: "#5f675f",
    fontSize: 13,
    lineHeight: 18,
  },
  accountChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  accountSectionLabel: {
    color: "#5f675f",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  accountChip: {
    backgroundColor: "#f3ebdb",
    borderRadius: 14,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  accountChipActive: {
    backgroundColor: "#123530",
  },
  accountChipLabel: {
    color: "#3f463f",
    fontSize: 13,
    fontWeight: "600",
  },
  accountChipLabelActive: {
    color: "#fdf8ef",
  },
  accountChipMeta: {
    color: "#5f675f",
    fontSize: 11,
    textTransform: "uppercase",
  },
  accountChipMetaActive: {
    color: "#9ec5bf",
  },
  postingEditorFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricHint: {
    color: "#5f675f",
    fontSize: 13,
    marginTop: 3,
  },
  tertiaryButton: {
    alignItems: "center",
    backgroundColor: "#d6c6ab",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tertiaryButtonLabel: {
    color: "#46392a",
    fontSize: 14,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
