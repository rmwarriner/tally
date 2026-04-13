import type { FinanceBookDocument } from "./types";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function assertSafeTagName(tagName: string): void {
  if (!/^[\w:.-]+$/.test(tagName)) {
    throw new Error(`Invalid XML tag name: ${tagName}`);
  }
}

function extractBlocks(contents: string, tagName: string): string[] {
  assertSafeTagName(tagName);
  return [...contents.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "g"))].map(
    (match) => match[1] ?? "",
  );
}

function extractTagText(contents: string, tagName: string): string | undefined {
  assertSafeTagName(tagName);
  const match = contents.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`));
  return match?.[1] ? unescapeXml(match[1].trim()) : undefined;
}

function assertSafeAttributeName(attributeName: string): void {
  if (!/^[\w:-]+$/.test(attributeName)) {
    throw new Error(`Invalid XML attribute name: ${attributeName}`);
  }
}

function extractAttribute(contents: string, attributeName: string): string | undefined {
  assertSafeAttributeName(attributeName);
  const match = contents.match(new RegExp(`${attributeName}="([^"]*)"`));
  return match?.[1] ? unescapeXml(match[1]) : undefined;
}

export const __testOnly = {
  assertSafeAttributeName,
  assertSafeTagName,
};

function extractBooleanAttribute(contents: string, attributeName: string): boolean | undefined {
  const value = extractAttribute(contents, attributeName);

  if (value === undefined) {
    return undefined;
  }

  return value === "true";
}

function extractNumberAttribute(contents: string, attributeName: string): number | undefined {
  const value = extractAttribute(contents, attributeName);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function renderStringList(tagName: string, values: string[]): string {
  if (values.length === 0) {
    return `<${tagName} />`;
  }

  return [
    `<${tagName}>`,
    ...values.map((value) => `<item>${escapeXml(value)}</item>`),
    `</${tagName}>`,
  ].join("");
}

function renderHouseholdMemberRoles(
  roles: NonNullable<FinanceBookDocument["householdMemberRoles"]> | undefined,
): string {
  if (!roles || Object.keys(roles).length === 0) {
    return "<ws:householdMemberRoles />";
  }

  return [
    "<ws:householdMemberRoles>",
    ...Object.entries(roles)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([actor, role]) => `<ws:memberRole actor="${escapeXml(actor)}" role="${escapeXml(role ?? "member")}" />`),
    "</ws:householdMemberRoles>",
  ].join("");
}

export function buildGnuCashXmlExport(params: {
  book: FinanceBookDocument;
}): {
  contents: string;
  fileName: string;
} {
  const book = params.book;
  const contents = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<gnc-v2 xmlns:ws="https://tally.dev/ns/workspace">',
    `<ws:workspace schemaVersion="${book.schemaVersion}" version="${book.version}" id="${escapeXml(book.id)}" name="${escapeXml(book.name)}" baseCommodityCode="${escapeXml(book.baseCommodityCode)}">`,
    renderStringList("ws:householdMembers", book.householdMembers),
    renderHouseholdMemberRoles(book.householdMemberRoles),
    "<ws:commodities>",
    ...book.commodities.map(
      (commodity) =>
        `<ws:commodity code="${escapeXml(commodity.code)}" name="${escapeXml(commodity.name)}" type="${escapeXml(commodity.type)}" precision="${commodity.precision}" />`,
    ),
    "</ws:commodities>",
    "<ws:accounts>",
    ...book.accounts.map(
      (account) =>
        `<ws:account id="${escapeXml(account.id)}" code="${escapeXml(account.code)}" name="${escapeXml(account.name)}" type="${escapeXml(account.type)}"${
          account.parentAccountId ? ` parentAccountId="${escapeXml(account.parentAccountId)}"` : ""
        }${
          account.isEnvelopeFundingSource !== undefined
            ? ` isEnvelopeFundingSource="${String(account.isEnvelopeFundingSource)}"`
            : ""
        }${account.taxCategory ? ` taxCategory="${escapeXml(account.taxCategory)}"` : ""} />`,
    ),
    "</ws:accounts>",
    "<ws:transactions>",
    ...book.transactions.map((transaction) =>
      [
        `<ws:transaction id="${escapeXml(transaction.id)}" occurredOn="${escapeXml(transaction.occurredOn)}" description="${escapeXml(transaction.description)}"${
          transaction.payee ? ` payee="${escapeXml(transaction.payee)}"` : ""
        }${transaction.scheduleId ? ` scheduleId="${escapeXml(transaction.scheduleId)}"` : ""}${
          transaction.deletion?.deletedAt ? ` deletedAt="${escapeXml(transaction.deletion.deletedAt)}"` : ""
        }${transaction.deletion?.deletedBy ? ` deletedBy="${escapeXml(transaction.deletion.deletedBy)}"` : ""}>`,
        "<ws:postings>",
        ...transaction.postings.map(
          (posting) =>
            `<ws:posting accountId="${escapeXml(posting.accountId)}" commodityCode="${escapeXml(posting.amount.commodityCode)}" quantity="${posting.amount.quantity}"${
              posting.memo ? ` memo="${escapeXml(posting.memo)}"` : ""
            }${posting.cleared !== undefined ? ` cleared="${String(posting.cleared)}"` : ""}${
              posting.reconciledAt ? ` reconciledAt="${escapeXml(posting.reconciledAt)}"` : ""
            } />`,
        ),
        "</ws:postings>",
        renderStringList("ws:tags", transaction.tags ?? []),
        transaction.source
          ? `<ws:source provider="${escapeXml(transaction.source.provider)}" fingerprint="${escapeXml(
              transaction.source.fingerprint,
            )}" importedAt="${escapeXml(transaction.source.importedAt)}"${
              transaction.source.externalReference
                ? ` externalReference="${escapeXml(transaction.source.externalReference)}"`
                : ""
            } />`
          : "<ws:source />",
        "</ws:transaction>",
      ].join(""),
    ),
    "</ws:transactions>",
    "<ws:scheduledTransactions>",
    ...book.scheduledTransactions.map((schedule) =>
      [
        `<ws:scheduledTransaction id="${escapeXml(schedule.id)}" name="${escapeXml(schedule.name)}" frequency="${escapeXml(schedule.frequency)}" nextDueOn="${escapeXml(schedule.nextDueOn)}" autoPost="${String(schedule.autoPost)}">`,
        `<ws:templateTransaction description="${escapeXml(schedule.templateTransaction.description)}"${
          schedule.templateTransaction.payee ? ` payee="${escapeXml(schedule.templateTransaction.payee)}"` : ""
        }>`,
        "<ws:postings>",
        ...schedule.templateTransaction.postings.map(
          (posting) =>
            `<ws:posting accountId="${escapeXml(posting.accountId)}" commodityCode="${escapeXml(posting.amount.commodityCode)}" quantity="${posting.amount.quantity}"${
              posting.memo ? ` memo="${escapeXml(posting.memo)}"` : ""
            }${posting.cleared !== undefined ? ` cleared="${String(posting.cleared)}"` : ""} />`,
        ),
        "</ws:postings>",
        renderStringList("ws:tags", schedule.templateTransaction.tags ?? []),
        "</ws:templateTransaction>",
        "</ws:scheduledTransaction>",
      ].join(""),
    ),
    "</ws:scheduledTransactions>",
    "<ws:baselineBudgetLines>",
    ...book.baselineBudgetLines.map(
      (line) =>
        `<ws:baselineBudgetLine accountId="${escapeXml(line.accountId)}" period="${escapeXml(
          line.period,
        )}" budgetPeriod="${escapeXml(line.budgetPeriod)}" commodityCode="${escapeXml(
          line.plannedAmount.commodityCode,
        )}" quantity="${line.plannedAmount.quantity}"${line.notes ? ` notes="${escapeXml(line.notes)}"` : ""} />`,
    ),
    "</ws:baselineBudgetLines>",
    "<ws:envelopes>",
    ...book.envelopes.map(
      (envelope) =>
        `<ws:envelope id="${escapeXml(envelope.id)}" name="${escapeXml(envelope.name)}" expenseAccountId="${escapeXml(
          envelope.expenseAccountId,
        )}" fundingAccountId="${escapeXml(envelope.fundingAccountId)}" availableCommodityCode="${escapeXml(
          envelope.availableAmount.commodityCode,
        )}" availableQuantity="${envelope.availableAmount.quantity}" rolloverEnabled="${String(
          envelope.rolloverEnabled,
        )}"${
          envelope.targetAmount
            ? ` targetCommodityCode="${escapeXml(envelope.targetAmount.commodityCode)}" targetQuantity="${envelope.targetAmount.quantity}"`
            : ""
        } />`,
    ),
    "</ws:envelopes>",
    "<ws:envelopeAllocations>",
    ...book.envelopeAllocations.map(
      (allocation) =>
        `<ws:envelopeAllocation id="${escapeXml(allocation.id)}" envelopeId="${escapeXml(
          allocation.envelopeId,
        )}" occurredOn="${escapeXml(allocation.occurredOn)}" commodityCode="${escapeXml(
          allocation.amount.commodityCode,
        )}" quantity="${allocation.amount.quantity}" type="${escapeXml(allocation.type)}"${
          allocation.note ? ` note="${escapeXml(allocation.note)}"` : ""
        } />`,
    ),
    "</ws:envelopeAllocations>",
    "<ws:importBatches>",
    ...book.importBatches.map((batch) =>
      [
        `<ws:importBatch id="${escapeXml(batch.id)}" importedAt="${escapeXml(batch.importedAt)}" provider="${escapeXml(
          batch.provider,
        )}" sourceLabel="${escapeXml(batch.sourceLabel)}" fingerprint="${escapeXml(batch.fingerprint)}">`,
        renderStringList("ws:transactionIds", batch.transactionIds),
        "</ws:importBatch>",
      ].join(""),
    ),
    "</ws:importBatches>",
    "<ws:reconciliationSessions>",
    ...book.reconciliationSessions.map((session) =>
      [
        `<ws:reconciliationSession id="${escapeXml(session.id)}" accountId="${escapeXml(
          session.accountId,
        )}" statementDate="${escapeXml(session.statementDate)}" commodityCode="${escapeXml(
          session.statementBalance.commodityCode,
        )}" statementBalance="${session.statementBalance.quantity}" difference="${session.difference.quantity}"${
          session.completedAt ? ` completedAt="${escapeXml(session.completedAt)}"` : ""
        }>`,
        renderStringList("ws:clearedTransactionIds", session.clearedTransactionIds),
        "</ws:reconciliationSession>",
      ].join(""),
    ),
    "</ws:reconciliationSessions>",
    "<ws:closePeriods>",
    ...(book.closePeriods ?? []).map(
      (period) =>
        `<ws:closePeriod id="${escapeXml(period.id)}" from="${escapeXml(period.from)}" to="${escapeXml(
          period.to,
        )}" closedAt="${escapeXml(period.closedAt)}" closedBy="${escapeXml(period.closedBy)}"${
          period.notes ? ` notes="${escapeXml(period.notes)}"` : ""
        } />`,
    ),
    "</ws:closePeriods>",
    "<ws:auditEvents>",
    ...book.auditEvents.map(
      (event) =>
        `<ws:auditEvent id="${escapeXml(event.id)}" bookId="${escapeXml(event.bookId)}" actor="${escapeXml(
          event.actor,
        )}" occurredAt="${escapeXml(event.occurredAt)}" eventType="${escapeXml(
          event.eventType,
        )}" entityIds="${escapeXml(JSON.stringify(event.entityIds))}" summary="${escapeXml(
          JSON.stringify(event.summary),
        )}" />`,
    ),
    "</ws:auditEvents>",
    "</ws:workspace>",
    "</gnc-v2>",
    "",
  ].join("\n");

  return {
    contents,
    fileName: `${book.id}.gnucash.xml`,
  };
}

export function parseGnuCashXml(contents: string): {
  document?: FinanceBookDocument;
  errors: string[];
} {
  const bookMatch = contents.match(/<ws:workspace\b([^>]*)>([\s\S]*?)<\/ws:workspace>/);

  if (!bookMatch) {
    return { errors: ["workspace: ws:workspace root element is required."] };
  }

  const header = bookMatch[1] ?? "";
  const body = bookMatch[2] ?? "";
  const schemaVersion = Number.parseInt(extractAttribute(header, "schemaVersion") ?? "", 10);
  const parsedVersion = Number.parseInt(extractAttribute(header, "version") ?? "1", 10);
  const version = Number.isInteger(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
  const id = extractAttribute(header, "id");
  const name = extractAttribute(header, "name");
  const baseCommodityCode = extractAttribute(header, "baseCommodityCode");
  const errors: string[] = [];

  if (schemaVersion !== 1) {
    errors.push("book: schemaVersion must be 1.");
  }

  if (!id) {
    errors.push("book: id is required.");
  }

  if (!name) {
    errors.push("book: name is required.");
  }

  if (!baseCommodityCode) {
    errors.push("book: baseCommodityCode is required.");
  }

  if (errors.length > 0 || !id || !name || !baseCommodityCode) {
    return { errors };
  }

  const householdMembers = extractBlocks(body, "ws:householdMembers").flatMap((block) =>
    extractBlocks(block, "item").map((item) => unescapeXml(item.trim())),
  );
  const householdMemberRoles = Object.fromEntries(
    extractBlocks(body, "ws:householdMemberRoles")
      .flatMap((section) => [...section.matchAll(/<ws:memberRole\b([^>]*)\/>/g)].map((match) => match[1] ?? ""))
      .flatMap((attributes) => {
        const actor = extractAttribute(attributes, "actor");
        const role = extractAttribute(attributes, "role");

        if (
          !actor ||
          (role !== "admin" && role !== "guardian" && role !== "member")
        ) {
          return [];
        }

        return [[actor, role] as const];
      }),
  );
  const commodities = extractBlocks(body, "ws:commodities")
    .flatMap((section) => [...section.matchAll(/<ws:commodity\b([^>]*)\/>/g)].map((match) => match[1] ?? ""))
    .map((attributes) => ({
      code: extractAttribute(attributes, "code") ?? "",
      name: extractAttribute(attributes, "name") ?? "",
      precision: Number.parseInt(extractAttribute(attributes, "precision") ?? "0", 10),
      type: (extractAttribute(attributes, "type") ?? "fiat") as FinanceBookDocument["commodities"][number]["type"],
    }));
  const accounts = extractBlocks(body, "ws:accounts")
    .flatMap((section) => [...section.matchAll(/<ws:account\b([^>]*)\/>/g)].map((match) => match[1] ?? ""))
    .map((attributes) => ({
      code: extractAttribute(attributes, "code") ?? "",
      id: extractAttribute(attributes, "id") ?? "",
      isEnvelopeFundingSource: extractBooleanAttribute(attributes, "isEnvelopeFundingSource"),
      name: extractAttribute(attributes, "name") ?? "",
      parentAccountId: extractAttribute(attributes, "parentAccountId"),
      taxCategory: extractAttribute(attributes, "taxCategory"),
      type: (extractAttribute(attributes, "type") ?? "asset") as FinanceBookDocument["accounts"][number]["type"],
    }));
  const transactions = extractBlocks(body, "ws:transactions").flatMap((section) =>
    [...section.matchAll(/<ws:transaction\b([^>]*)>([\s\S]*?)<\/ws:transaction>/g)].map((match) => {
      const attributes = match[1] ?? "";
      const transactionBody = match[2] ?? "";
      const sourceSection = extractTagText(transactionBody, "ws:source");
      const sourceAttributes = transactionBody.match(/<ws:source\b([^>]*)\/>/)?.[1] ?? "";

      return {
        description: extractAttribute(attributes, "description") ?? "",
        id: extractAttribute(attributes, "id") ?? "",
        occurredOn: extractAttribute(attributes, "occurredOn") ?? "",
        payee: extractAttribute(attributes, "payee"),
        postings: extractBlocks(transactionBody, "ws:postings").flatMap((postingSection) =>
          [...postingSection.matchAll(/<ws:posting\b([^>]*)\/>/g)].map((postingMatch) => {
            const postingAttributes = postingMatch[1] ?? "";
            return {
              accountId: extractAttribute(postingAttributes, "accountId") ?? "",
              amount: {
                commodityCode: extractAttribute(postingAttributes, "commodityCode") ?? baseCommodityCode,
                quantity: Number.parseFloat(extractAttribute(postingAttributes, "quantity") ?? "0"),
              },
              cleared: extractBooleanAttribute(postingAttributes, "cleared"),
              memo: extractAttribute(postingAttributes, "memo"),
              reconciledAt: extractAttribute(postingAttributes, "reconciledAt"),
            };
          }),
        ),
        scheduleId: extractAttribute(attributes, "scheduleId"),
        deletion:
          extractAttribute(attributes, "deletedAt") && extractAttribute(attributes, "deletedBy")
            ? {
                deletedAt: extractAttribute(attributes, "deletedAt") ?? "",
                deletedBy: extractAttribute(attributes, "deletedBy") ?? "",
              }
            : undefined,
        source:
          sourceAttributes.length > 0
            ? {
                externalReference: extractAttribute(sourceAttributes, "externalReference"),
                fingerprint: extractAttribute(sourceAttributes, "fingerprint") ?? "",
                importedAt: extractAttribute(sourceAttributes, "importedAt") ?? "",
                provider: (extractAttribute(sourceAttributes, "provider") ??
                  "gnucash-xml") as NonNullable<
                  FinanceBookDocument["transactions"][number]["source"]
                >["provider"],
              }
            : undefined,
        tags: extractBlocks(transactionBody, "ws:tags").flatMap((tagSection) =>
          extractBlocks(tagSection, "item").map((item) => unescapeXml(item.trim())),
        ),
      };
    }),
  );
  const scheduledTransactions = extractBlocks(body, "ws:scheduledTransactions").flatMap((section) =>
    [...section.matchAll(/<ws:scheduledTransaction\b([^>]*)>([\s\S]*?)<\/ws:scheduledTransaction>/g)].map((match) => {
      const attributes = match[1] ?? "";
      const scheduleBody = match[2] ?? "";
      const templateMatch = scheduleBody.match(/<ws:templateTransaction\b([^>]*)>([\s\S]*?)<\/ws:templateTransaction>/);
      const templateAttributes = templateMatch?.[1] ?? "";
      const templateBody = templateMatch?.[2] ?? "";

      return {
        autoPost: extractBooleanAttribute(attributes, "autoPost") ?? false,
        frequency: (extractAttribute(attributes, "frequency") ??
          "monthly") as FinanceBookDocument["scheduledTransactions"][number]["frequency"],
        id: extractAttribute(attributes, "id") ?? "",
        name: extractAttribute(attributes, "name") ?? "",
        nextDueOn: extractAttribute(attributes, "nextDueOn") ?? "",
        templateTransaction: {
          description: extractAttribute(templateAttributes, "description") ?? "",
          payee: extractAttribute(templateAttributes, "payee"),
          postings: extractBlocks(templateBody, "ws:postings").flatMap((postingSection) =>
            [...postingSection.matchAll(/<ws:posting\b([^>]*)\/>/g)].map((postingMatch) => {
              const postingAttributes = postingMatch[1] ?? "";
              return {
                accountId: extractAttribute(postingAttributes, "accountId") ?? "",
                amount: {
                  commodityCode: extractAttribute(postingAttributes, "commodityCode") ?? baseCommodityCode,
                  quantity: Number.parseFloat(extractAttribute(postingAttributes, "quantity") ?? "0"),
                },
                cleared: extractBooleanAttribute(postingAttributes, "cleared"),
                memo: extractAttribute(postingAttributes, "memo"),
              };
            }),
          ),
          tags: extractBlocks(templateBody, "ws:tags").flatMap((tagSection) =>
            extractBlocks(tagSection, "item").map((item) => unescapeXml(item.trim())),
          ),
        },
      };
    }),
  );
  const baselineBudgetLines = extractBlocks(body, "ws:baselineBudgetLines")
    .flatMap((section) => [...section.matchAll(/<ws:baselineBudgetLine\b([^>]*)\/>/g)].map((match) => match[1] ?? ""))
    .map((attributes) => ({
      accountId: extractAttribute(attributes, "accountId") ?? "",
      budgetPeriod: (extractAttribute(attributes, "budgetPeriod") ??
        "monthly") as FinanceBookDocument["baselineBudgetLines"][number]["budgetPeriod"],
      notes: extractAttribute(attributes, "notes"),
      period: extractAttribute(attributes, "period") ?? "",
      plannedAmount: {
        commodityCode: extractAttribute(attributes, "commodityCode") ?? baseCommodityCode,
        quantity: Number.parseFloat(extractAttribute(attributes, "quantity") ?? "0"),
      },
    }));
  const envelopes = extractBlocks(body, "ws:envelopes")
    .flatMap((section) => [...section.matchAll(/<ws:envelope\b([^>]*)\/>/g)].map((match) => match[1] ?? ""))
    .map((attributes) => {
      const targetCommodityCode = extractAttribute(attributes, "targetCommodityCode");
      const targetQuantity = extractNumberAttribute(attributes, "targetQuantity");

      return {
        availableAmount: {
          commodityCode: extractAttribute(attributes, "availableCommodityCode") ?? baseCommodityCode,
          quantity: Number.parseFloat(extractAttribute(attributes, "availableQuantity") ?? "0"),
        },
        expenseAccountId: extractAttribute(attributes, "expenseAccountId") ?? "",
        fundingAccountId: extractAttribute(attributes, "fundingAccountId") ?? "",
        id: extractAttribute(attributes, "id") ?? "",
        name: extractAttribute(attributes, "name") ?? "",
        rolloverEnabled: extractBooleanAttribute(attributes, "rolloverEnabled") ?? false,
        targetAmount:
          targetCommodityCode && targetQuantity !== undefined
            ? {
                commodityCode: targetCommodityCode,
                quantity: targetQuantity,
              }
            : undefined,
      };
    });
  const envelopeAllocations = extractBlocks(body, "ws:envelopeAllocations")
    .flatMap((section) =>
      [...section.matchAll(/<ws:envelopeAllocation\b([^>]*)\/>/g)].map((match) => match[1] ?? ""),
    )
    .map((attributes) => ({
      amount: {
        commodityCode: extractAttribute(attributes, "commodityCode") ?? baseCommodityCode,
        quantity: Number.parseFloat(extractAttribute(attributes, "quantity") ?? "0"),
      },
      envelopeId: extractAttribute(attributes, "envelopeId") ?? "",
      id: extractAttribute(attributes, "id") ?? "",
      note: extractAttribute(attributes, "note"),
      occurredOn: extractAttribute(attributes, "occurredOn") ?? "",
      type: (extractAttribute(attributes, "type") ??
        "fund") as FinanceBookDocument["envelopeAllocations"][number]["type"],
    }));
  const importBatches = extractBlocks(body, "ws:importBatches").flatMap((section) =>
    [...section.matchAll(/<ws:importBatch\b([^>]*)>([\s\S]*?)<\/ws:importBatch>/g)].map((match) => {
      const attributes = match[1] ?? "";
      const batchBody = match[2] ?? "";

      return {
        fingerprint: extractAttribute(attributes, "fingerprint") ?? "",
        id: extractAttribute(attributes, "id") ?? "",
        importedAt: extractAttribute(attributes, "importedAt") ?? "",
        provider: (extractAttribute(attributes, "provider") ??
          "csv") as FinanceBookDocument["importBatches"][number]["provider"],
        sourceLabel: extractAttribute(attributes, "sourceLabel") ?? "",
        transactionIds: extractBlocks(batchBody, "ws:transactionIds").flatMap((items) =>
          extractBlocks(items, "item").map((item) => unescapeXml(item.trim())),
        ),
      };
    }),
  );
  const reconciliationSessions = extractBlocks(body, "ws:reconciliationSessions").flatMap((section) =>
    [...section.matchAll(/<ws:reconciliationSession\b([^>]*)>([\s\S]*?)<\/ws:reconciliationSession>/g)].map(
      (match) => {
        const attributes = match[1] ?? "";
        const sessionBody = match[2] ?? "";
        return {
          accountId: extractAttribute(attributes, "accountId") ?? "",
          clearedTransactionIds: extractBlocks(sessionBody, "ws:clearedTransactionIds").flatMap((items) =>
            extractBlocks(items, "item").map((item) => unescapeXml(item.trim())),
          ),
          completedAt: extractAttribute(attributes, "completedAt"),
          difference: {
            commodityCode: extractAttribute(attributes, "commodityCode") ?? baseCommodityCode,
            quantity: Number.parseFloat(extractAttribute(attributes, "difference") ?? "0"),
          },
          id: extractAttribute(attributes, "id") ?? "",
          statementBalance: {
            commodityCode: extractAttribute(attributes, "commodityCode") ?? baseCommodityCode,
            quantity: Number.parseFloat(extractAttribute(attributes, "statementBalance") ?? "0"),
          },
          statementDate: extractAttribute(attributes, "statementDate") ?? "",
        };
      },
    ),
  );
  const closePeriods = extractBlocks(body, "ws:closePeriods")
    .flatMap((section) => [...section.matchAll(/<ws:closePeriod\b([^>]*)\/>/g)].map((match) => match[1] ?? ""))
    .map((attributes) => ({
      closedAt: extractAttribute(attributes, "closedAt") ?? "",
      closedBy: extractAttribute(attributes, "closedBy") ?? "",
      from: extractAttribute(attributes, "from") ?? "",
      id: extractAttribute(attributes, "id") ?? "",
      notes: extractAttribute(attributes, "notes"),
      to: extractAttribute(attributes, "to") ?? "",
    }));
  const auditEvents = extractBlocks(body, "ws:auditEvents")
    .flatMap((section) => [...section.matchAll(/<ws:auditEvent\b([^>]*)\/>/g)].map((match) => match[1] ?? ""))
    .map((attributes) => ({
      actor: extractAttribute(attributes, "actor") ?? "",
      entityIds: JSON.parse(extractAttribute(attributes, "entityIds") ?? "[]") as string[],
      eventType: (extractAttribute(attributes, "eventType") ??
        "transaction.created") as FinanceBookDocument["auditEvents"][number]["eventType"],
      id: extractAttribute(attributes, "id") ?? "",
      occurredAt: extractAttribute(attributes, "occurredAt") ?? "",
      summary: JSON.parse(extractAttribute(attributes, "summary") ?? "{}") as Record<string, unknown>,
      bookId: extractAttribute(attributes, "bookId") ?? id,
    }));

  return {
    errors: [],
    document: {
      accounts,
      auditEvents,
      baseCommodityCode,
      baselineBudgetLines,
      commodities,
      envelopeAllocations,
      envelopes,
      householdMembers,
      ...(Object.keys(householdMemberRoles).length > 0 ? { householdMemberRoles } : {}),
      id,
      importBatches,
      name,
      closePeriods,
      reconciliationSessions,
      scheduledTransactions,
      schemaVersion: 1,
      transactions,
      version,
    },
  };
}
