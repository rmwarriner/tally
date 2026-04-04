import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ScheduleFrequency, Transaction } from "@gnucash-ng/domain";
import { createMobileApiClient, type DashboardResponse, type WorkspaceResponse } from "./api";
import { ReconciliationCapture, type ReconciliationFormValue } from "./ReconciliationCapture";
import { SchedulePostingEditor } from "./SchedulePostingEditor";
import {
  addSchedulePosting,
  createScheduleForm,
  createSchedulePostingForm,
  removeSchedulePosting,
  type ScheduleFormState,
  updateSchedulePosting,
  validateScheduleForm,
} from "./schedule-form";

const aprilRange = { from: "2026-04-01", to: "2026-04-30" };
const defaultWorkspaceId = "workspace-household-demo";
const defaultApiBaseUrl = "http://127.0.0.1:3000";
const scheduleFrequencies: ScheduleFrequency[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annually",
];

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    currency: "USD",
    style: "currency",
  });
}

function createEntityId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

function formatSignedCurrency(amount: number): string {
  const formatted = formatCurrency(Math.abs(amount));
  return amount < 0 ? `-${formatted}` : formatted;
}

function createReconciliationForm(accountId = "acct-checking"): ReconciliationFormValue {
  return {
    accountId,
    reconciliationId: "",
    statementBalance: "",
    statementDate: "2026-04-30",
  };
}

function createReconciliationTransactionMap(transactions: Transaction[], accountId: string): Record<string, boolean> {
  return Object.fromEntries(
    transactions
      .filter((transaction) => transaction.postings.some((posting) => posting.accountId === accountId))
      .map((transaction) => [
        transaction.id,
        transaction.postings.some((posting) => posting.accountId === accountId && posting.cleared === true),
      ]),
  );
}

export function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [workspace, setWorkspace] = useState<WorkspaceResponse["workspace"] | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse["dashboard"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState("sched-rent");
  const [transactionForm, setTransactionForm] = useState({
    amount: "14.25",
    date: "2026-04-03",
    description: "Coffee and snacks",
    expenseAccountId: "acct-expense-groceries",
    payee: "Corner Market",
  });
  const [allocationForm, setAllocationForm] = useState({
    amount: "75",
    envelopeId: "env-groceries",
    note: "Weekly grocery top-up",
    occurredOn: "2026-04-03",
    type: "fund" as "fund" | "release",
  });
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => createScheduleForm());
  const [scheduleExceptionForm, setScheduleExceptionForm] = useState({
    nextDueOn: "2026-05-05",
    note: "Grace period",
  });
  const [reconciliationForm, setReconciliationForm] = useState<ReconciliationFormValue>(() =>
    createReconciliationForm(),
  );
  const [selectedReconciliationTransactionIds, setSelectedReconciliationTransactionIds] = useState<
    Record<string, boolean>
  >({});

  async function loadWorkspaceData() {
    setLoading(true);
    setError(null);

    try {
      const client = createMobileApiClient({
        apiBaseUrl,
        apiKey: apiKey.trim() || undefined,
      });
      const [workspaceResponse, dashboardResponse] = await Promise.all([
        client.fetchWorkspace(workspaceId.trim()),
        client.fetchDashboard({
          ...aprilRange,
          workspaceId: workspaceId.trim(),
        }),
      ]);

      setWorkspace(workspaceResponse.workspace);
      setDashboard(dashboardResponse.dashboard);

      const activeSchedule =
        workspaceResponse.workspace.scheduledTransactions.find((schedule) => schedule.id === selectedScheduleId) ??
        workspaceResponse.workspace.scheduledTransactions[0];

      if (activeSchedule) {
        setSelectedScheduleId(activeSchedule.id);
        setScheduleForm(createScheduleForm(activeSchedule));
      }

      const reconciliationAccounts = workspaceResponse.workspace.accounts.filter(
        (account) => account.type === "asset" || account.type === "liability",
      );
      const activeReconciliationAccountId =
        reconciliationAccounts.find((account) => account.id === reconciliationForm.accountId)?.id ??
        reconciliationAccounts[0]?.id ??
        workspaceResponse.workspace.accounts[0]?.id ??
        "acct-checking";
      const activeReconciliationTransactions = workspaceResponse.workspace.transactions.filter(
        (transaction) =>
          transaction.postings.some((posting) => posting.accountId === activeReconciliationAccountId),
      );

      setReconciliationForm((current) => ({
        ...current,
        accountId: activeReconciliationAccountId,
      }));
      setSelectedReconciliationTransactionIds(
        createReconciliationTransactionMap(activeReconciliationTransactions, activeReconciliationAccountId),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load mobile workspace.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspaceData();
  }, []);

  async function runMutation(label: string, operation: () => Promise<void>) {
    try {
      setBusy(label);
      setStatusMessage(null);
      setError(null);
      await operation();
      await loadWorkspaceData();
      setStatusMessage(`${label} completed.`);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : `${label} failed.`);
    } finally {
      setBusy(null);
    }
  }

  const fundingNote =
    apiBaseUrl === defaultApiBaseUrl
      ? "Use a LAN IP instead of 127.0.0.1 when testing on a physical device."
      : "If your API requires auth, include the API key configured on the server.";

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Mobile workspace</Text>
        <Text style={styles.title}>Household operations</Text>
        <Text style={styles.helperText}>
          Capture transactions, approve due schedules, handle schedule exceptions, and manage cadence from the same
          service layer as the desktop shell.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Connection</Text>
        <View style={styles.field}>
          <Text style={styles.label}>API base URL</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setApiBaseUrl}
            placeholder="http://192.168.1.15:3000"
            placeholderTextColor="#7b7c73"
            style={styles.input}
            value={apiBaseUrl}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Workspace ID</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setWorkspaceId}
            placeholder="workspace-household-demo"
            placeholderTextColor="#7b7c73"
            style={styles.input}
            value={workspaceId}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>API key</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setApiKey}
            placeholder="Optional for protected non-loopback APIs"
            placeholderTextColor="#7b7c73"
            secureTextEntry
            style={styles.input}
            value={apiKey}
          />
        </View>
        <Text style={styles.note}>{fundingNote}</Text>
        <Pressable
          disabled={loading || busy !== null}
          onPress={() => {
            void loadWorkspaceData();
          }}
          style={[styles.primaryButton, (loading || busy !== null) && styles.buttonDisabled]}
        >
          <Text style={styles.primaryButtonLabel}>{loading ? "Refreshing..." : "Refresh mobile workspace"}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#006b5f" size="large" />
          <Text style={styles.loadingText}>Loading workspace and dashboard projections.</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>API unavailable</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {statusMessage ? (
        <View style={styles.successCard}>
          <Text style={styles.successText}>{statusMessage}</Text>
        </View>
      ) : null}

      {workspace && dashboard && !loading ? (
        <>
          {(() => {
            const expenseAccounts = workspace.accounts.filter((account) => account.type === "expense");
            const dueSchedules = workspace.scheduledTransactions.filter(
              (schedule) => schedule.nextDueOn <= aprilRange.to,
            );
            const activeSchedule =
              workspace.scheduledTransactions.find((schedule) => schedule.id === selectedScheduleId) ??
              workspace.scheduledTransactions[0];
            const scheduleValidationErrors = validateScheduleForm(scheduleForm);
            const scheduleSaveDisabled = busy !== null || scheduleValidationErrors.length > 0;
            const scheduleTemplateBalance = scheduleForm.postings.reduce((sum, posting) => {
              const quantity = Number.parseFloat(posting.amount);
              return Number.isFinite(quantity) ? sum + quantity : sum;
            }, 0);

            return (
              <>
                <View style={styles.summaryRow}>
                  <View style={[styles.summaryCard, styles.summaryLight]}>
                    <Text style={styles.summaryLabel}>Net worth</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(dashboard.netWorth.quantity)}</Text>
                  </View>
                  <View style={[styles.summaryCard, styles.summaryDark]}>
                    <Text style={styles.summaryLabelDark}>Due schedules</Text>
                    <Text style={styles.summaryValueDark}>{dashboard.dueTransactions.length}</Text>
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Quick transaction</Text>
                  <View style={styles.field}>
                    <Text style={styles.label}>Description</Text>
                    <TextInput
                      onChangeText={(value) => setTransactionForm((current) => ({ ...current, description: value }))}
                      placeholder="Coffee and snacks"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={transactionForm.description}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Payee</Text>
                    <TextInput
                      onChangeText={(value) => setTransactionForm((current) => ({ ...current, payee: value }))}
                      placeholder="Corner Market"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={transactionForm.payee}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Date</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(value) => setTransactionForm((current) => ({ ...current, date: value }))}
                      placeholder="2026-04-03"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={transactionForm.date}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Expense account</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(value) =>
                        setTransactionForm((current) => ({ ...current, expenseAccountId: value }))
                      }
                      placeholder={expenseAccounts[0]?.id ?? "acct-expense-groceries"}
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={transactionForm.expenseAccountId}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Amount</Text>
                    <TextInput
                      keyboardType="decimal-pad"
                      onChangeText={(value) => setTransactionForm((current) => ({ ...current, amount: value }))}
                      placeholder="14.25"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={transactionForm.amount}
                    />
                  </View>
                  <Pressable
                    disabled={busy !== null}
                    onPress={() => {
                      void runMutation("Transaction capture", async () => {
                        const client = createMobileApiClient({
                          apiBaseUrl,
                          apiKey: apiKey.trim() || undefined,
                        });

                        const amount = Number.parseFloat(transactionForm.amount);
                        await client.postTransaction(workspaceId.trim(), {
                          transaction: {
                            description: transactionForm.description.trim(),
                            id: createEntityId("txn-mobile"),
                            occurredOn: transactionForm.date.trim(),
                            payee: transactionForm.payee.trim() || undefined,
                            postings: [
                              {
                                accountId: transactionForm.expenseAccountId.trim(),
                                amount: { commodityCode: "USD", quantity: amount },
                              },
                              {
                                accountId: "acct-checking",
                                amount: { commodityCode: "USD", quantity: -amount },
                                cleared: true,
                              },
                            ],
                          },
                        });
                      });
                    }}
                    style={[styles.primaryButton, busy !== null && styles.buttonDisabled]}
                  >
                    <Text style={styles.primaryButtonLabel}>
                      {busy === "Transaction capture" ? "Saving..." : "Post transaction"}
                    </Text>
                  </Pressable>
                </View>

                <ReconciliationCapture
                  accounts={workspace.accounts}
                  busy={busy === "Reconciliation capture"}
                  form={reconciliationForm}
                  onAccountChange={(accountId) => {
                    setReconciliationForm((current) => ({
                      ...current,
                      accountId,
                    }));
                    setSelectedReconciliationTransactionIds(
                      createReconciliationTransactionMap(workspace.transactions, accountId),
                    );
                  }}
                  onFormChange={(patch) =>
                    setReconciliationForm((current) => ({
                      ...current,
                      ...patch,
                    }))
                  }
                  onSubmit={() => {
                    void runMutation("Reconciliation capture", async () => {
                      const selectedReconciliationAccount =
                        workspace.accounts.find((account) => account.id === reconciliationForm.accountId) ??
                        workspace.accounts.find(
                          (account) => account.type === "asset" || account.type === "liability",
                        );

                      if (!selectedReconciliationAccount) {
                        return;
                      }

                      const selectedClearedTransactionIds = workspace.transactions
                        .filter(
                          (transaction) =>
                            transaction.occurredOn <= reconciliationForm.statementDate.trim() &&
                            transaction.postings.some(
                              (posting) => posting.accountId === selectedReconciliationAccount.id,
                            ) &&
                            selectedReconciliationTransactionIds[transaction.id],
                        )
                        .map((transaction) => transaction.id);

                      const client = createMobileApiClient({
                        apiBaseUrl,
                        apiKey: apiKey.trim() || undefined,
                      });

                      await client.postReconciliation(workspaceId.trim(), {
                        payload: {
                          accountId: selectedReconciliationAccount.id,
                          clearedTransactionIds: selectedClearedTransactionIds,
                          reconciliationId: reconciliationForm.reconciliationId.trim() || undefined,
                          statementBalance: Number.parseFloat(reconciliationForm.statementBalance),
                          statementDate: reconciliationForm.statementDate.trim(),
                        },
                      });
                    });
                  }}
                  onToggleTransaction={(transactionId) =>
                    setSelectedReconciliationTransactionIds((current) => ({
                      ...current,
                      [transactionId]: !current[transactionId],
                    }))
                  }
                  reconciliationSessions={workspace.reconciliationSessions}
                  selectedTransactionIds={selectedReconciliationTransactionIds}
                  transactions={workspace.transactions}
                />

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Schedule management</Text>
                  <Text style={styles.note}>
                    Edit cadence, next due date, template postings, and auto-post behavior directly from mobile.
                  </Text>
                  <View style={styles.schedulePicker}>
                    {workspace.scheduledTransactions.map((schedule) => (
                      <Pressable
                        key={schedule.id}
                        onPress={() => {
                          setSelectedScheduleId(schedule.id);
                          setScheduleForm(createScheduleForm(schedule));
                        }}
                        style={[
                          styles.scheduleChip,
                          schedule.id === selectedScheduleId && styles.scheduleChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.scheduleChipLabel,
                            schedule.id === selectedScheduleId && styles.scheduleChipLabelActive,
                          ]}
                        >
                          {schedule.name}
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => {
                        const nextId = createEntityId("sched-mobile");
                        setSelectedScheduleId(nextId);
                        setScheduleForm({
                          autoPost: false,
                          description: "Scheduled expense",
                          frequency: "monthly",
                          id: nextId,
                          name: "New schedule",
                          nextDueOn: "2026-05-15",
                          payee: "",
                          postings: [
                            createSchedulePostingForm(expenseAccounts[0]?.id ?? "acct-expense-housing", "100"),
                            createSchedulePostingForm("acct-checking", "-100"),
                          ],
                        });
                      }}
                      style={styles.scheduleChip}
                    >
                      <Text style={styles.scheduleChipLabel}>New</Text>
                    </Pressable>
                  </View>
                  {activeSchedule ? (
                    <Text style={styles.note}>
                      Active schedule: {activeSchedule.name} due {activeSchedule.nextDueOn}
                    </Text>
                  ) : null}
                  <View style={styles.field}>
                    <Text style={styles.label}>Schedule ID</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(value) => setScheduleForm((current) => ({ ...current, id: value }))}
                      placeholder="sched-rent"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={scheduleForm.id}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Name</Text>
                    <TextInput
                      onChangeText={(value) => setScheduleForm((current) => ({ ...current, name: value }))}
                      placeholder="Monthly Rent"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={scheduleForm.name}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Description</Text>
                    <TextInput
                      onChangeText={(value) => setScheduleForm((current) => ({ ...current, description: value }))}
                      placeholder="Monthly rent"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={scheduleForm.description}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Payee</Text>
                    <TextInput
                      onChangeText={(value) => setScheduleForm((current) => ({ ...current, payee: value }))}
                      placeholder="Property Management Co."
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={scheduleForm.payee}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Next due date</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(value) => setScheduleForm((current) => ({ ...current, nextDueOn: value }))}
                      placeholder="2026-05-01"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={scheduleForm.nextDueOn}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Frequency</Text>
                    <View style={styles.frequencyRow}>
                      {scheduleFrequencies.map((frequency) => (
                        <Pressable
                          key={frequency}
                          onPress={() => setScheduleForm((current) => ({ ...current, frequency }))}
                          style={[
                            styles.frequencyChip,
                            scheduleForm.frequency === frequency && styles.frequencyChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.frequencyChipLabel,
                              scheduleForm.frequency === frequency && styles.frequencyChipLabelActive,
                            ]}
                          >
                            {frequency}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Template postings</Text>
                    <Text style={styles.note}>
                      Use signed amounts. Positive lines debit the target account, negative lines credit it.
                    </Text>
                    <View style={styles.cardInset}>
                      {scheduleForm.postings.map((posting, index) => (
                        <SchedulePostingEditor
                          key={`${scheduleForm.id}:posting:${index}`}
                          accounts={workspace.accounts}
                          busy={busy !== null}
                          canRemove={scheduleForm.postings.length > 2}
                          lineNumber={index + 1}
                          onAccountChange={(accountId) =>
                            setScheduleForm((current) => updateSchedulePosting(current, index, { accountId }))
                          }
                          onAmountChange={(amount) =>
                            setScheduleForm((current) => updateSchedulePosting(current, index, { amount }))
                          }
                          onMemoChange={(memo) =>
                            setScheduleForm((current) => updateSchedulePosting(current, index, { memo }))
                          }
                          onRemove={() => setScheduleForm((current) => removeSchedulePosting(current, index))}
                          onSearchChange={(accountSearch) =>
                            setScheduleForm((current) => updateSchedulePosting(current, index, { accountSearch }))
                          }
                          posting={posting}
                        />
                      ))}
                      <View style={styles.summaryRow}>
                        <View style={[styles.summaryCard, styles.summaryLight]}>
                          <Text style={styles.summaryLabel}>Posting lines</Text>
                          <Text style={styles.summaryValue}>{scheduleForm.postings.length}</Text>
                        </View>
                        <View
                          style={[
                            styles.summaryCard,
                            scheduleTemplateBalance === 0 ? styles.summaryDark : styles.summaryWarn,
                          ]}
                        >
                          <Text style={styles.summaryLabelDark}>Template balance</Text>
                          <Text style={styles.summaryValueDark}>{formatSignedCurrency(scheduleTemplateBalance)}</Text>
                        </View>
                      </View>
                      <Pressable
                        disabled={busy !== null}
                        onPress={() => setScheduleForm((current) => addSchedulePosting(current))}
                        style={[styles.secondaryButton, busy !== null && styles.buttonDisabled]}
                      >
                        <Text style={styles.secondaryButtonLabel}>Add posting line</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.switchRow}>
                    <View>
                      <Text style={styles.label}>Auto-post</Text>
                      <Text style={styles.note}>
                        Enable automatic posting when the schedule reaches its due date.
                      </Text>
                    </View>
                    <Switch
                      onValueChange={(value) => setScheduleForm((current) => ({ ...current, autoPost: value }))}
                      thumbColor="#fffaf1"
                      trackColor={{ false: "#827c70", true: "#006b5f" }}
                      value={scheduleForm.autoPost}
                    />
                  </View>
                  <Pressable
                    disabled={scheduleSaveDisabled}
                    onPress={() => {
                      void runMutation("Schedule save", async () => {
                        const client = createMobileApiClient({
                          apiBaseUrl,
                          apiKey: apiKey.trim() || undefined,
                        });

                        await client.postScheduledTransaction(workspaceId.trim(), {
                          schedule: {
                            autoPost: scheduleForm.autoPost,
                            frequency: scheduleForm.frequency,
                            id: scheduleForm.id.trim(),
                            name: scheduleForm.name.trim(),
                            nextDueOn: scheduleForm.nextDueOn.trim(),
                            templateTransaction: {
                              description: scheduleForm.description.trim(),
                              payee: scheduleForm.payee.trim() || undefined,
                              postings: scheduleForm.postings.map((posting) => ({
                                accountId: posting.accountId.trim(),
                                amount: {
                                  commodityCode: "USD",
                                  quantity: Number.parseFloat(posting.amount),
                                },
                                memo: posting.memo.trim() || undefined,
                              })),
                            },
                          },
                        });
                        setSelectedScheduleId(scheduleForm.id.trim());
                      });
                    }}
                    style={[styles.primaryButton, scheduleSaveDisabled && styles.buttonDisabled]}
                  >
                    <Text style={styles.primaryButtonLabel}>
                      {busy === "Schedule save" ? "Saving..." : "Save schedule"}
                    </Text>
                  </Pressable>
                  {scheduleValidationErrors.length ? (
                    <View style={styles.validationBox}>
                      <Text style={styles.validationTitle}>Resolve before saving</Text>
                      {scheduleValidationErrors.map((validationError) => (
                        <Text key={validationError} style={styles.validationText}>
                          {validationError}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.exceptionBox}>
                    <Text style={styles.label}>Schedule exceptions</Text>
                    <Text style={styles.note}>
                      Skip the next occurrence without posting, or defer the next due date to an exact day.
                    </Text>
                    <View style={styles.field}>
                      <Text style={styles.label}>Deferred next due date</Text>
                      <TextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        onChangeText={(value) =>
                          setScheduleExceptionForm((current) => ({ ...current, nextDueOn: value }))
                        }
                        placeholder="2026-05-05"
                        placeholderTextColor="#7b7c73"
                        style={styles.input}
                        value={scheduleExceptionForm.nextDueOn}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.label}>Exception note</Text>
                      <TextInput
                        onChangeText={(value) =>
                          setScheduleExceptionForm((current) => ({ ...current, note: value }))
                        }
                        placeholder="Grace period"
                        placeholderTextColor="#7b7c73"
                        style={styles.input}
                        value={scheduleExceptionForm.note}
                      />
                    </View>
                    <View style={styles.exceptionActions}>
                      <Pressable
                        disabled={busy !== null}
                        onPress={() => {
                          void runMutation("Schedule skip", async () => {
                            const client = createMobileApiClient({
                              apiBaseUrl,
                              apiKey: apiKey.trim() || undefined,
                            });

                            await client.applyScheduledTransactionException(workspaceId.trim(), scheduleForm.id.trim(), {
                              payload: {
                                action: "skip-next",
                                effectiveOn: scheduleForm.nextDueOn.trim(),
                                note: scheduleExceptionForm.note.trim() || undefined,
                              },
                            });
                          });
                        }}
                        style={[styles.secondaryButton, busy !== null && styles.buttonDisabled]}
                      >
                        <Text style={styles.secondaryButtonLabel}>
                          {busy === "Schedule skip" ? "Skipping..." : "Skip next"}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={busy !== null}
                        onPress={() => {
                          void runMutation("Schedule defer", async () => {
                            const client = createMobileApiClient({
                              apiBaseUrl,
                              apiKey: apiKey.trim() || undefined,
                            });

                            await client.applyScheduledTransactionException(workspaceId.trim(), scheduleForm.id.trim(), {
                              payload: {
                                action: "defer",
                                nextDueOn: scheduleExceptionForm.nextDueOn.trim(),
                                note: scheduleExceptionForm.note.trim() || undefined,
                              },
                            });
                          });
                        }}
                        style={[styles.secondaryButton, busy !== null && styles.buttonDisabled]}
                      >
                        <Text style={styles.secondaryButtonLabel}>
                          {busy === "Schedule defer" ? "Deferring..." : "Defer"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Envelope operations</Text>
                  {dashboard.envelopeSnapshot.map((envelope) => (
                    <View key={envelope.envelopeId} style={styles.metricRow}>
                      <View>
                        <Text style={styles.metricLabel}>{envelope.name}</Text>
                        <Text style={styles.metricHint}>Funded {formatCurrency(envelope.funded.quantity)}</Text>
                      </View>
                      <Text style={styles.metricValue}>{formatCurrency(envelope.available.quantity)}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Quick envelope action</Text>
                  <View style={styles.field}>
                    <Text style={styles.label}>Envelope ID</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(value) => setAllocationForm((current) => ({ ...current, envelopeId: value }))}
                      placeholder="env-groceries"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={allocationForm.envelopeId}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Amount</Text>
                    <TextInput
                      keyboardType="decimal-pad"
                      onChangeText={(value) => setAllocationForm((current) => ({ ...current, amount: value }))}
                      placeholder="75"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={allocationForm.amount}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Date</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(value) => setAllocationForm((current) => ({ ...current, occurredOn: value }))}
                      placeholder="2026-04-03"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={allocationForm.occurredOn}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Note</Text>
                    <TextInput
                      onChangeText={(value) => setAllocationForm((current) => ({ ...current, note: value }))}
                      placeholder="Optional note"
                      placeholderTextColor="#7b7c73"
                      style={styles.input}
                      value={allocationForm.note}
                    />
                  </View>
                  <View style={styles.switchRow}>
                    <View>
                      <Text style={styles.label}>Action</Text>
                      <Text style={styles.note}>
                        {allocationForm.type === "fund"
                          ? "Funding increases available cash."
                          : "Release moves cash back out of the envelope."}
                      </Text>
                    </View>
                    <View style={styles.switchControl}>
                      <Text style={styles.switchLabel}>Release</Text>
                      <Switch
                        onValueChange={(value) =>
                          setAllocationForm((current) => ({ ...current, type: value ? "release" : "fund" }))
                        }
                        thumbColor="#fffaf1"
                        trackColor={{ false: "#006b5f", true: "#c0624b" }}
                        value={allocationForm.type === "release"}
                      />
                    </View>
                  </View>
                  <Pressable
                    disabled={busy !== null}
                    onPress={() => {
                      void runMutation("Envelope update", async () => {
                        const client = createMobileApiClient({
                          apiBaseUrl,
                          apiKey: apiKey.trim() || undefined,
                        });

                        await client.postEnvelopeAllocation(workspaceId.trim(), {
                          allocation: {
                            amount: {
                              commodityCode: "USD",
                              quantity: Number.parseFloat(allocationForm.amount),
                            },
                            envelopeId: allocationForm.envelopeId.trim(),
                            id: createEntityId("alloc-mobile"),
                            note: allocationForm.note.trim() || undefined,
                            occurredOn: allocationForm.occurredOn.trim(),
                            type: allocationForm.type,
                          },
                        });
                      });
                    }}
                    style={[styles.primaryButton, busy !== null && styles.buttonDisabled]}
                  >
                    <Text style={styles.primaryButtonLabel}>
                      {busy === "Envelope update" ? "Saving..." : "Post envelope action"}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Due schedule approvals</Text>
                  {dueSchedules.map((schedule) => (
                    <View key={schedule.id} style={styles.approvalCard}>
                      <View style={styles.approvalHeader}>
                        <View>
                          <Text style={styles.metricLabel}>{schedule.name}</Text>
                          <Text style={styles.metricHint}>Due {schedule.nextDueOn}</Text>
                        </View>
                        <Pressable
                          disabled={busy !== null}
                          onPress={() => {
                            void runMutation("Schedule approval", async () => {
                              const client = createMobileApiClient({
                                apiBaseUrl,
                                apiKey: apiKey.trim() || undefined,
                              });

                              await client.executeScheduledTransaction(workspaceId.trim(), schedule.id, {
                                payload: {
                                  occurredOn: schedule.nextDueOn,
                                },
                              });
                            });
                          }}
                          style={[styles.secondaryButton, busy !== null && styles.buttonDisabled]}
                        >
                          <Text style={styles.secondaryButtonLabel}>
                            {busy === "Schedule approval" ? "Posting..." : "Approve"}
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={busy !== null}
                          onPress={() => {
                            void runMutation("Schedule skip", async () => {
                              const client = createMobileApiClient({
                                apiBaseUrl,
                                apiKey: apiKey.trim() || undefined,
                              });

                              await client.applyScheduledTransactionException(workspaceId.trim(), schedule.id, {
                                payload: {
                                  action: "skip-next",
                                  effectiveOn: schedule.nextDueOn,
                                  note: "Skipped from mobile",
                                },
                              });
                            });
                          }}
                          style={[styles.tertiaryButton, busy !== null && styles.buttonDisabled]}
                        >
                          <Text style={styles.tertiaryButtonLabel}>
                            {busy === "Schedule skip" ? "Skipping..." : "Skip"}
                          </Text>
                        </Pressable>
                      </View>
                      <Text style={styles.note}>{schedule.templateTransaction.description}</Text>
                    </View>
                  ))}
                  {!dueSchedules.length ? (
                    <Text style={styles.note}>No scheduled transactions are currently due for approval.</Text>
                  ) : null}
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Balances</Text>
                  {dashboard.accountBalances.map((balance) => (
                    <View key={`${balance.accountId}:${balance.commodityCode}`} style={styles.metricRow}>
                      <View>
                        <Text style={styles.metricLabel}>{balance.accountName}</Text>
                        <Text style={styles.metricHint}>{balance.accountType}</Text>
                      </View>
                      <Text style={styles.metricValue}>{formatCurrency(balance.balance)}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Scheduled activity</Text>
                  {workspace.scheduledTransactions.map((schedule) => (
                    <View key={schedule.id} style={styles.scheduleItem}>
                      <View>
                        <Text style={styles.metricLabel}>{schedule.name}</Text>
                        <Text style={styles.metricHint}>{schedule.frequency}</Text>
                      </View>
                      <Text style={styles.metricValue}>{schedule.nextDueOn}</Text>
                    </View>
                  ))}
                  {!workspace.scheduledTransactions.length ? (
                    <Text style={styles.note}>No scheduled transactions are configured for this workspace.</Text>
                  ) : null}
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Budget watchlist</Text>
                  {dashboard.budgetSnapshot.map((row) => (
                    <View key={row.accountId} style={styles.metricRow}>
                      <View>
                        <Text style={styles.metricLabel}>{row.accountName}</Text>
                        <Text style={styles.metricHint}>Planned {formatCurrency(row.planned.quantity)}</Text>
                      </View>
                      <Text style={styles.metricValue}>{formatCurrency(row.variance.quantity)} left</Text>
                    </View>
                  ))}
                </View>
              </>
            );
          })()}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#e7dfcf",
    gap: 18,
    minHeight: "100%",
    padding: 20,
  },
  heroCard: {
    backgroundColor: "#1f2321",
    borderRadius: 24,
    padding: 20,
  },
  eyebrow: {
    color: "#d7ddd6",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: "#fdf8ef",
    fontSize: 30,
    fontWeight: "700",
    marginTop: 8,
  },
  helperText: {
    color: "#d7ddd6",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
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
  loadingCard: {
    alignItems: "center",
    backgroundColor: "#fffaf1",
    borderRadius: 24,
    gap: 10,
    padding: 24,
  },
  loadingText: {
    color: "#3f463f",
    fontSize: 15,
  },
  errorCard: {
    backgroundColor: "#5f2015",
    borderRadius: 24,
    padding: 18,
  },
  errorTitle: {
    color: "#fff5f2",
    fontSize: 18,
    fontWeight: "700",
  },
  errorText: {
    color: "#ffd8cf",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  successCard: {
    backgroundColor: "#d9f0e8",
    borderRadius: 24,
    padding: 16,
  },
  successText: {
    color: "#0c4b42",
    fontSize: 14,
    fontWeight: "600",
  },
  validationBox: {
    backgroundColor: "#5f2015",
    borderRadius: 18,
    gap: 6,
    padding: 14,
  },
  validationTitle: {
    color: "#fff5f2",
    fontSize: 14,
    fontWeight: "700",
  },
  validationText: {
    color: "#ffd8cf",
    fontSize: 13,
    lineHeight: 18,
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
  metricRow: {
    alignItems: "center",
    borderTopColor: "#eadfcb",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
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
  cardInset: {
    backgroundColor: "#f3ebdb",
    borderRadius: 18,
    gap: 10,
    padding: 14,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  switchControl: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  switchLabel: {
    color: "#3f463f",
    fontSize: 14,
    fontWeight: "600",
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
  frequencyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  frequencyChip: {
    backgroundColor: "#f3ebdb",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  frequencyChipActive: {
    backgroundColor: "#006b5f",
  },
  frequencyChipLabel: {
    color: "#3f463f",
    fontSize: 13,
    fontWeight: "600",
  },
  frequencyChipLabelActive: {
    color: "#fdf8ef",
  },
  scheduleItem: {
    alignItems: "center",
    borderTopColor: "#eadfcb",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  approvalCard: {
    borderTopColor: "#eadfcb",
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
  },
  approvalHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  exceptionBox: {
    backgroundColor: "#f3ebdb",
    borderRadius: 18,
    gap: 12,
    padding: 14,
  },
  exceptionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#1f2321",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonLabel: {
    color: "#fdf8ef",
    fontSize: 14,
    fontWeight: "700",
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
});
