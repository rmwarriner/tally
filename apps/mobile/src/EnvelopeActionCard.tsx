import { Pressable, Switch, Text, TextInput, View } from "react-native";

export interface EnvelopeActionFormState {
  amount: string;
  envelopeId: string;
  note: string;
  occurredOn: string;
  type: "fund" | "release";
}

export function EnvelopeActionCard(props: {
  busy: string | null;
  form: EnvelopeActionFormState;
  onFormChange: (patch: Partial<EnvelopeActionFormState>) => void;
  onSubmit: () => void;
  styles: any;
}) {
  return (
    <View style={props.styles.card}>
      <Text style={props.styles.sectionTitle}>Quick envelope action</Text>
      <View style={props.styles.field}>
        <Text style={props.styles.label}>Envelope ID</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => props.onFormChange({ envelopeId: value })}
          placeholder="env-groceries"
          placeholderTextColor="#7b7c73"
          style={props.styles.input}
          value={props.form.envelopeId}
        />
      </View>
      <View style={props.styles.field}>
        <Text style={props.styles.label}>Amount</Text>
        <TextInput
          keyboardType="decimal-pad"
          onChangeText={(value) => props.onFormChange({ amount: value })}
          placeholder="75"
          placeholderTextColor="#7b7c73"
          style={props.styles.input}
          value={props.form.amount}
        />
      </View>
      <View style={props.styles.field}>
        <Text style={props.styles.label}>Date</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => props.onFormChange({ occurredOn: value })}
          placeholder="2026-04-03"
          placeholderTextColor="#7b7c73"
          style={props.styles.input}
          value={props.form.occurredOn}
        />
      </View>
      <View style={props.styles.field}>
        <Text style={props.styles.label}>Note</Text>
        <TextInput
          onChangeText={(value) => props.onFormChange({ note: value })}
          placeholder="Optional note"
          placeholderTextColor="#7b7c73"
          style={props.styles.input}
          value={props.form.note}
        />
      </View>
      <View style={props.styles.switchRow}>
        <View>
          <Text style={props.styles.label}>Action</Text>
          <Text style={props.styles.note}>
            {props.form.type === "fund"
              ? "Funding increases available cash."
              : "Release moves cash back out of the envelope."}
          </Text>
        </View>
        <View style={props.styles.switchControl}>
          <Text style={props.styles.switchLabel}>Release</Text>
          <Switch
            onValueChange={(value) => props.onFormChange({ type: value ? "release" : "fund" })}
            thumbColor="#fffaf1"
            trackColor={{ false: "#006b5f", true: "#c0624b" }}
            value={props.form.type === "release"}
          />
        </View>
      </View>
      <Pressable
        disabled={props.busy !== null}
        onPress={props.onSubmit}
        style={[props.styles.primaryButton, props.busy !== null && props.styles.buttonDisabled]}
      >
        <Text style={props.styles.primaryButtonLabel}>
          {props.busy === "Envelope update" ? "Saving..." : "Post envelope action"}
        </Text>
      </Pressable>
    </View>
  );
}
