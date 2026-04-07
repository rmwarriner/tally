import { Pressable, Text, TextInput, View } from "react-native";

export interface TransactionCaptureFormState {
  amount: string;
  date: string;
  description: string;
  expenseAccountId: string;
  payee: string;
}

export function TransactionCaptureCard(props: {
  busy: string | null;
  expenseAccountPlaceholder: string;
  form: TransactionCaptureFormState;
  onFormChange: (patch: Partial<TransactionCaptureFormState>) => void;
  onSubmit: () => void;
  styles: any;
}) {
  return (
    <View style={props.styles.card}>
      <Text style={props.styles.sectionTitle}>Quick transaction</Text>
      <View style={props.styles.field}>
        <Text style={props.styles.label}>Description</Text>
        <TextInput
          onChangeText={(value) => props.onFormChange({ description: value })}
          placeholder="Coffee and snacks"
          placeholderTextColor="#7b7c73"
          style={props.styles.input}
          value={props.form.description}
        />
      </View>
      <View style={props.styles.field}>
        <Text style={props.styles.label}>Payee</Text>
        <TextInput
          onChangeText={(value) => props.onFormChange({ payee: value })}
          placeholder="Corner Market"
          placeholderTextColor="#7b7c73"
          style={props.styles.input}
          value={props.form.payee}
        />
      </View>
      <View style={props.styles.field}>
        <Text style={props.styles.label}>Date</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => props.onFormChange({ date: value })}
          placeholder="2026-04-03"
          placeholderTextColor="#7b7c73"
          style={props.styles.input}
          value={props.form.date}
        />
      </View>
      <View style={props.styles.field}>
        <Text style={props.styles.label}>Expense account</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => props.onFormChange({ expenseAccountId: value })}
          placeholder={props.expenseAccountPlaceholder}
          placeholderTextColor="#7b7c73"
          style={props.styles.input}
          value={props.form.expenseAccountId}
        />
      </View>
      <View style={props.styles.field}>
        <Text style={props.styles.label}>Amount</Text>
        <TextInput
          keyboardType="decimal-pad"
          onChangeText={(value) => props.onFormChange({ amount: value })}
          placeholder="14.25"
          placeholderTextColor="#7b7c73"
          style={props.styles.input}
          value={props.form.amount}
        />
      </View>
      <Pressable
        disabled={props.busy !== null}
        onPress={props.onSubmit}
        style={[props.styles.primaryButton, props.busy !== null && props.styles.buttonDisabled]}
      >
        <Text style={props.styles.primaryButtonLabel}>
          {props.busy === "Transaction capture" ? "Saving..." : "Post transaction"}
        </Text>
      </Pressable>
    </View>
  );
}
