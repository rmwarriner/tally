export interface HttpReadRouteMatches {
  accountsMatch: RegExpMatchArray | null;
  approvalsMatch: RegExpMatchArray | null;
  auditEventsMatch: RegExpMatchArray | null;
  backupsMatch: RegExpMatchArray | null;
  booksMatch: RegExpMatchArray | null;
  closePeriodsMatch: RegExpMatchArray | null;
  closeSummaryMatch: RegExpMatchArray | null;
  dashboardMatch: RegExpMatchArray | null;
  gnucashXmlExportMatch: RegExpMatchArray | null;
  householdMembersMatch: RegExpMatchArray | null;
  qifExportMatch: RegExpMatchArray | null;
  reportMatch: RegExpMatchArray | null;
  statementExportMatch: RegExpMatchArray | null;
  transactionsMatch: RegExpMatchArray | null;
  attachmentDownloadMatch: RegExpMatchArray | null;
  tokensMatch: RegExpMatchArray | null;
  bookMatch: RegExpMatchArray | null;
}

export interface HttpPostRouteMatches {
  accountMatch: RegExpMatchArray | null;
  approvalGrantMatch: RegExpMatchArray | null;
  approvalDenyMatch: RegExpMatchArray | null;
  approvalRequestMatch: RegExpMatchArray | null;
  backupRestoreMatch: RegExpMatchArray | null;
  backupsCreateMatch: RegExpMatchArray | null;
  booksCreateMatch: RegExpMatchArray | null;
  bodylessPostRoute: boolean;
  budgetLineMatch: RegExpMatchArray | null;
  closePeriodMatch: RegExpMatchArray | null;
  csvImportMatch: RegExpMatchArray | null;
  coverOverspendMatch: RegExpMatchArray | null;
  envelopeAllocationMatch: RegExpMatchArray | null;
  envelopeMatch: RegExpMatchArray | null;
  exceptionScheduleMatch: RegExpMatchArray | null;
  executeScheduleMatch: RegExpMatchArray | null;
  gnucashXmlImportMatch: RegExpMatchArray | null;
  householdMemberMatch: RegExpMatchArray | null;
  qifImportMatch: RegExpMatchArray | null;
  reconciliationMatch: RegExpMatchArray | null;
  scheduleMatch: RegExpMatchArray | null;
  statementImportMatch: RegExpMatchArray | null;
  restoreTransactionMatch: RegExpMatchArray | null;
  attachmentUploadMatch: RegExpMatchArray | null;
  transactionAttachmentLinkMatch: RegExpMatchArray | null;
  transactionMatch: RegExpMatchArray | null;
  tokensCreateMatch: RegExpMatchArray | null;
  sessionsExchangeMatch: RegExpMatchArray | null;
}

export interface HttpDeleteRouteMatches {
  archiveAccountMatch: RegExpMatchArray | null;
  deleteTransactionMatch: RegExpMatchArray | null;
  destroyTransactionMatch: RegExpMatchArray | null;
  removeHouseholdMemberMatch: RegExpMatchArray | null;
  transactionAttachmentUnlinkMatch: RegExpMatchArray | null;
  tokenDeleteMatch: RegExpMatchArray | null;
  sessionCurrentDeleteMatch: RegExpMatchArray | null;
}

export interface HttpPutRouteMatches {
  putTransactionMatch: RegExpMatchArray | null;
  setHouseholdMemberRoleMatch: RegExpMatchArray | null;
}

export function isOptionsRoute(method: string, _path: string): boolean {
  return method === "OPTIONS";
}

export function isLivenessRoute(method: string, path: string): boolean {
  return method === "GET" && (path === "/healthz" || path === "/health/live");
}

export function isReadinessRoute(method: string, path: string): boolean {
  return method === "GET" && (path === "/readyz" || path === "/health/ready");
}

export function isMetricsRoute(method: string, path: string): boolean {
  return method === "GET" && path === "/metrics";
}

export function normalizeRouteLabel(method: string, path: string): string {
  const normalizedPath = path.replace(/^\/api\/v1(?=\/|$)/, "/api");

  if (isLivenessRoute(method, normalizedPath)) {
    return "/healthz";
  }

  if (isReadinessRoute(method, normalizedPath)) {
    return "/readyz";
  }

  if (isMetricsRoute(method, normalizedPath)) {
    return "/metrics";
  }

  if (normalizedPath === "/api/books") {
    return "/api/books";
  }

  if (/^\/api\/books\/[^/]+$/.test(normalizedPath)) {
    return "/api/books/:bookId";
  }

  if (/^\/api\/books\/[^/]+\/dashboard$/.test(normalizedPath)) {
    return "/api/books/:bookId/dashboard";
  }

  if (/^\/api\/books\/[^/]+\/reports\/[^/]+$/.test(normalizedPath)) {
    return "/api/books/:bookId/reports/:kind";
  }

  if (/^\/api\/books\/[^/]+\/close-summary$/.test(normalizedPath)) {
    return "/api/books/:bookId/close-summary";
  }

  if (/^\/api\/books\/[^/]+\/close-periods$/.test(normalizedPath)) {
    return "/api/books/:bookId/close-periods";
  }

  if (/^\/api\/books\/[^/]+\/backups$/.test(normalizedPath)) {
    return "/api/books/:bookId/backups";
  }

  if (/^\/api\/books\/[^/]+\/backups\/[^/]+\/restore$/.test(normalizedPath)) {
    return "/api/books/:bookId/backups/:backupId/restore";
  }

  if (/^\/api\/books\/[^/]+\/transactions$/.test(normalizedPath)) {
    return "/api/books/:bookId/transactions";
  }

  if (/^\/api\/books\/[^/]+\/transactions\/[^/]+\/restore$/.test(normalizedPath)) {
    return "/api/books/:bookId/transactions/:transactionId/restore";
  }

  if (/^\/api\/books\/[^/]+\/transactions\/[^/]+\/destroy$/.test(normalizedPath)) {
    return "/api/books/:bookId/transactions/:transactionId/destroy";
  }

  if (/^\/api\/books\/[^/]+\/transactions\/[^/]+\/attachments$/.test(normalizedPath)) {
    return "/api/books/:bookId/transactions/:transactionId/attachments";
  }

  if (/^\/api\/books\/[^/]+\/transactions\/[^/]+\/attachments\/[^/]+$/.test(normalizedPath)) {
    return "/api/books/:bookId/transactions/:transactionId/attachments/:attachmentId";
  }

  if (/^\/api\/books\/[^/]+\/attachments$/.test(normalizedPath)) {
    return "/api/books/:bookId/attachments";
  }

  if (/^\/api\/books\/[^/]+\/attachments\/[^/]+$/.test(normalizedPath)) {
    return "/api/books/:bookId/attachments/:attachmentId";
  }

  if (/^\/api\/books\/[^/]+\/transactions\/[^/]+$/.test(normalizedPath)) {
    return "/api/books/:bookId/transactions/:transactionId";
  }

  if (/^\/api\/books\/[^/]+\/budget-lines$/.test(normalizedPath)) {
    return "/api/books/:bookId/budget-lines";
  }

  if (/^\/api\/books\/[^/]+\/envelopes$/.test(normalizedPath)) {
    return "/api/books/:bookId/envelopes";
  }

  if (/^\/api\/books\/[^/]+\/envelopes\/cover-overspend$/.test(normalizedPath)) {
    return "/api/books/:bookId/envelopes/cover-overspend";
  }

  if (/^\/api\/books\/[^/]+\/envelope-allocations$/.test(normalizedPath)) {
    return "/api/books/:bookId/envelope-allocations";
  }

  if (/^\/api\/books\/[^/]+\/reconciliations$/.test(normalizedPath)) {
    return "/api/books/:bookId/reconciliations";
  }

  if (/^\/api\/books\/[^/]+\/schedules$/.test(normalizedPath)) {
    return "/api/books/:bookId/schedules";
  }

  if (/^\/api\/books\/[^/]+\/schedules\/[^/]+\/execute$/.test(normalizedPath)) {
    return "/api/books/:bookId/schedules/:scheduleId/execute";
  }

  if (/^\/api\/books\/[^/]+\/schedules\/[^/]+\/exceptions$/.test(normalizedPath)) {
    return "/api/books/:bookId/schedules/:scheduleId/exceptions";
  }

  if (/^\/api\/books\/[^/]+\/imports\/csv$/.test(normalizedPath)) {
    return "/api/books/:bookId/imports/csv";
  }

  if (/^\/api\/books\/[^/]+\/imports\/qif$/.test(normalizedPath)) {
    return "/api/books/:bookId/imports/qif";
  }

  if (/^\/api\/books\/[^/]+\/imports\/ofx$/.test(normalizedPath)) {
    return "/api/books/:bookId/imports/ofx";
  }

  if (/^\/api\/books\/[^/]+\/imports\/qfx$/.test(normalizedPath)) {
    return "/api/books/:bookId/imports/qfx";
  }

  if (/^\/api\/books\/[^/]+\/imports\/gnucash-xml$/.test(normalizedPath)) {
    return "/api/books/:bookId/imports/gnucash-xml";
  }

  if (/^\/api\/books\/[^/]+\/exports\/qif$/.test(normalizedPath)) {
    return "/api/books/:bookId/exports/qif";
  }

  if (/^\/api\/books\/[^/]+\/exports\/ofx$/.test(normalizedPath)) {
    return "/api/books/:bookId/exports/ofx";
  }

  if (/^\/api\/books\/[^/]+\/exports\/qfx$/.test(normalizedPath)) {
    return "/api/books/:bookId/exports/qfx";
  }

  if (/^\/api\/books\/[^/]+\/exports\/gnucash-xml$/.test(normalizedPath)) {
    return "/api/books/:bookId/exports/gnucash-xml";
  }

  if (/^\/api\/books\/[^/]+\/members$/.test(normalizedPath)) {
    return "/api/books/:bookId/members";
  }

  if (/^\/api\/books\/[^/]+\/members\/[^/]+\/role$/.test(normalizedPath)) {
    return "/api/books/:bookId/members/:actor/role";
  }

  if (/^\/api\/books\/[^/]+\/members\/[^/]+$/.test(normalizedPath)) {
    return "/api/books/:bookId/members/:actor";
  }

  if (/^\/api\/books\/[^/]+\/approvals$/.test(normalizedPath)) {
    return "/api/books/:bookId/approvals";
  }

  if (/^\/api\/books\/[^/]+\/approvals\/[^/]+\/grant$/.test(normalizedPath)) {
    return "/api/books/:bookId/approvals/:approvalId/grant";
  }

  if (/^\/api\/books\/[^/]+\/approvals\/[^/]+\/deny$/.test(normalizedPath)) {
    return "/api/books/:bookId/approvals/:approvalId/deny";
  }

  if (/^\/api\/books\/[^/]+\/audit-events$/.test(normalizedPath)) {
    return "/api/books/:bookId/audit-events";
  }

  if (/^\/api\/books\/[^/]+\/accounts$/.test(normalizedPath)) {
    return "/api/books/:bookId/accounts";
  }

  if (/^\/api\/books\/[^/]+\/accounts\/[^/]+$/.test(normalizedPath)) {
    return "/api/books/:bookId/accounts/:accountId";
  }

  if (normalizedPath === "/api/tokens") {
    return "/api/tokens";
  }

  if (/^\/api\/tokens\/[^/]+$/.test(normalizedPath)) {
    return "/api/tokens/:tokenId";
  }

  if (normalizedPath === "/api/sessions/exchange") {
    return "/api/sessions/exchange";
  }

  if (normalizedPath === "/api/sessions/current") {
    return "/api/sessions/current";
  }

  return normalizedPath;
}

export function matchHttpReadRoutes(path: string): HttpReadRouteMatches {
  return {
    accountsMatch: path.match(/^\/api\/books\/([^/]+)\/accounts$/),
    approvalsMatch: path.match(/^\/api\/books\/([^/]+)\/approvals$/),
    auditEventsMatch: path.match(/^\/api\/books\/([^/]+)\/audit-events$/),
    backupsMatch: path.match(/^\/api\/books\/([^/]+)\/backups$/),
    booksMatch: path.match(/^\/api\/books$/),
    closePeriodsMatch: path.match(/^\/api\/books\/([^/]+)\/close-periods$/),
    closeSummaryMatch: path.match(/^\/api\/books\/([^/]+)\/close-summary$/),
    dashboardMatch: path.match(/^\/api\/books\/([^/]+)\/dashboard$/),
    gnucashXmlExportMatch: path.match(/^\/api\/books\/([^/]+)\/exports\/gnucash-xml$/),
    householdMembersMatch: path.match(/^\/api\/books\/([^/]+)\/members$/),
    qifExportMatch: path.match(/^\/api\/books\/([^/]+)\/exports\/qif$/),
    reportMatch: path.match(/^\/api\/books\/([^/]+)\/reports\/([^/]+)$/),
    statementExportMatch: path.match(/^\/api\/books\/([^/]+)\/exports\/(ofx|qfx)$/),
    transactionsMatch: path.match(/^\/api\/books\/([^/]+)\/transactions$/),
    attachmentDownloadMatch: path.match(/^\/api\/books\/([^/]+)\/attachments\/([^/]+)$/),
    tokensMatch: path.match(/^\/api\/tokens$/),
    bookMatch: path.match(/^\/api\/books\/([^/]+)$/),
  };
}

export function matchHttpPostRoutes(path: string): HttpPostRouteMatches {
  const backupsCreateMatch = path.match(/^\/api\/books\/([^/]+)\/backups$/);
  const booksCreateMatch = path.match(/^\/api\/books$/);
  const backupRestoreMatch = path.match(/^\/api\/books\/([^/]+)\/backups\/([^/]+)\/restore$/);
  const approvalGrantMatch = path.match(/^\/api\/books\/([^/]+)\/approvals\/([^/]+)\/grant$/);
  const approvalDenyMatch = path.match(/^\/api\/books\/([^/]+)\/approvals\/([^/]+)\/deny$/);

  return {
    accountMatch: path.match(/^\/api\/books\/([^/]+)\/accounts$/),
    approvalGrantMatch,
    approvalDenyMatch,
    approvalRequestMatch: path.match(/^\/api\/books\/([^/]+)\/approvals$/),
    backupRestoreMatch,
    backupsCreateMatch,
    booksCreateMatch,
    bodylessPostRoute: Boolean(
      backupsCreateMatch ||
      backupRestoreMatch ||
      approvalGrantMatch ||
      approvalDenyMatch ||
      path.match(/^\/api\/books\/([^/]+)\/transactions\/([^/]+)\/restore$/),
    ),
    budgetLineMatch: path.match(/^\/api\/books\/([^/]+)\/budget-lines$/),
    closePeriodMatch: path.match(/^\/api\/books\/([^/]+)\/close-periods$/),
    csvImportMatch: path.match(/^\/api\/books\/([^/]+)\/imports\/csv$/),
    coverOverspendMatch: path.match(/^\/api\/books\/([^/]+)\/envelopes\/cover-overspend$/),
    envelopeAllocationMatch: path.match(/^\/api\/books\/([^/]+)\/envelope-allocations$/),
    envelopeMatch: path.match(/^\/api\/books\/([^/]+)\/envelopes$/),
    exceptionScheduleMatch: path.match(/^\/api\/books\/([^/]+)\/schedules\/([^/]+)\/exceptions$/),
    executeScheduleMatch: path.match(/^\/api\/books\/([^/]+)\/schedules\/([^/]+)\/execute$/),
    gnucashXmlImportMatch: path.match(/^\/api\/books\/([^/]+)\/imports\/gnucash-xml$/),
    householdMemberMatch: path.match(/^\/api\/books\/([^/]+)\/members$/),
    qifImportMatch: path.match(/^\/api\/books\/([^/]+)\/imports\/qif$/),
    reconciliationMatch: path.match(/^\/api\/books\/([^/]+)\/reconciliations$/),
    scheduleMatch: path.match(/^\/api\/books\/([^/]+)\/schedules$/),
    statementImportMatch: path.match(/^\/api\/books\/([^/]+)\/imports\/(ofx|qfx)$/),
    restoreTransactionMatch: path.match(/^\/api\/books\/([^/]+)\/transactions\/([^/]+)\/restore$/),
    attachmentUploadMatch: path.match(/^\/api\/books\/([^/]+)\/attachments$/),
    transactionAttachmentLinkMatch: path.match(/^\/api\/books\/([^/]+)\/transactions\/([^/]+)\/attachments$/),
    transactionMatch: path.match(/^\/api\/books\/([^/]+)\/transactions$/),
    tokensCreateMatch: path.match(/^\/api\/tokens$/),
    sessionsExchangeMatch: path.match(/^\/api\/sessions\/exchange$/),
  };
}

export function matchHttpPutRoutes(path: string): HttpPutRouteMatches {
  return {
    putTransactionMatch: path.match(/^\/api\/books\/([^/]+)\/transactions\/([^/]+)$/),
    setHouseholdMemberRoleMatch: path.match(/^\/api\/books\/([^/]+)\/members\/([^/]+)\/role$/),
  };
}

export function matchHttpDeleteRoutes(path: string): HttpDeleteRouteMatches {
  return {
    archiveAccountMatch: path.match(/^\/api\/books\/([^/]+)\/accounts\/([^/]+)$/),
    deleteTransactionMatch: path.match(/^\/api\/books\/([^/]+)\/transactions\/([^/]+)$/),
    destroyTransactionMatch: path.match(/^\/api\/books\/([^/]+)\/transactions\/([^/]+)\/destroy$/),
    removeHouseholdMemberMatch: path.match(/^\/api\/books\/([^/]+)\/members\/([^/]+)$/),
    transactionAttachmentUnlinkMatch: path.match(/^\/api\/books\/([^/]+)\/transactions\/([^/]+)\/attachments\/([^/]+)$/),
    tokenDeleteMatch: path.match(/^\/api\/tokens\/([^/]+)$/),
    sessionCurrentDeleteMatch: path.match(/^\/api\/sessions\/current$/),
  };
}
