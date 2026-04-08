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
  transactionMatch: RegExpMatchArray | null;
}

export interface HttpDeleteRouteMatches {
  archiveAccountMatch: RegExpMatchArray | null;
  deleteTransactionMatch: RegExpMatchArray | null;
  destroyTransactionMatch: RegExpMatchArray | null;
  removeHouseholdMemberMatch: RegExpMatchArray | null;
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
  if (isLivenessRoute(method, path)) {
    return "/healthz";
  }

  if (isReadinessRoute(method, path)) {
    return "/readyz";
  }

  if (isMetricsRoute(method, path)) {
    return "/metrics";
  }

  if (path === "/api/books") {
    return "/api/books";
  }

  if (/^\/api\/books\/[^/]+$/.test(path)) {
    return "/api/books/:bookId";
  }

  if (/^\/api\/books\/[^/]+\/dashboard$/.test(path)) {
    return "/api/books/:bookId/dashboard";
  }

  if (/^\/api\/books\/[^/]+\/reports\/[^/]+$/.test(path)) {
    return "/api/books/:bookId/reports/:kind";
  }

  if (/^\/api\/books\/[^/]+\/close-summary$/.test(path)) {
    return "/api/books/:bookId/close-summary";
  }

  if (/^\/api\/books\/[^/]+\/close-periods$/.test(path)) {
    return "/api/books/:bookId/close-periods";
  }

  if (/^\/api\/books\/[^/]+\/backups$/.test(path)) {
    return "/api/books/:bookId/backups";
  }

  if (/^\/api\/books\/[^/]+\/backups\/[^/]+\/restore$/.test(path)) {
    return "/api/books/:bookId/backups/:backupId/restore";
  }

  if (/^\/api\/books\/[^/]+\/transactions$/.test(path)) {
    return "/api/books/:bookId/transactions";
  }

  if (/^\/api\/books\/[^/]+\/transactions\/[^/]+\/destroy$/.test(path)) {
    return "/api/books/:bookId/transactions/:transactionId/destroy";
  }

  if (/^\/api\/books\/[^/]+\/transactions\/[^/]+$/.test(path)) {
    return "/api/books/:bookId/transactions/:transactionId";
  }

  if (/^\/api\/books\/[^/]+\/budget-lines$/.test(path)) {
    return "/api/books/:bookId/budget-lines";
  }

  if (/^\/api\/books\/[^/]+\/envelopes$/.test(path)) {
    return "/api/books/:bookId/envelopes";
  }

  if (/^\/api\/books\/[^/]+\/envelope-allocations$/.test(path)) {
    return "/api/books/:bookId/envelope-allocations";
  }

  if (/^\/api\/books\/[^/]+\/reconciliations$/.test(path)) {
    return "/api/books/:bookId/reconciliations";
  }

  if (/^\/api\/books\/[^/]+\/schedules$/.test(path)) {
    return "/api/books/:bookId/schedules";
  }

  if (/^\/api\/books\/[^/]+\/schedules\/[^/]+\/execute$/.test(path)) {
    return "/api/books/:bookId/schedules/:scheduleId/execute";
  }

  if (/^\/api\/books\/[^/]+\/schedules\/[^/]+\/exceptions$/.test(path)) {
    return "/api/books/:bookId/schedules/:scheduleId/exceptions";
  }

  if (/^\/api\/books\/[^/]+\/imports\/csv$/.test(path)) {
    return "/api/books/:bookId/imports/csv";
  }

  if (/^\/api\/books\/[^/]+\/imports\/qif$/.test(path)) {
    return "/api/books/:bookId/imports/qif";
  }

  if (/^\/api\/books\/[^/]+\/imports\/ofx$/.test(path)) {
    return "/api/books/:bookId/imports/ofx";
  }

  if (/^\/api\/books\/[^/]+\/imports\/qfx$/.test(path)) {
    return "/api/books/:bookId/imports/qfx";
  }

  if (/^\/api\/books\/[^/]+\/imports\/gnucash-xml$/.test(path)) {
    return "/api/books/:bookId/imports/gnucash-xml";
  }

  if (/^\/api\/books\/[^/]+\/exports\/qif$/.test(path)) {
    return "/api/books/:bookId/exports/qif";
  }

  if (/^\/api\/books\/[^/]+\/exports\/ofx$/.test(path)) {
    return "/api/books/:bookId/exports/ofx";
  }

  if (/^\/api\/books\/[^/]+\/exports\/qfx$/.test(path)) {
    return "/api/books/:bookId/exports/qfx";
  }

  if (/^\/api\/books\/[^/]+\/exports\/gnucash-xml$/.test(path)) {
    return "/api/books/:bookId/exports/gnucash-xml";
  }

  if (/^\/api\/books\/[^/]+\/members$/.test(path)) {
    return "/api/books/:bookId/members";
  }

  if (/^\/api\/books\/[^/]+\/members\/[^/]+\/role$/.test(path)) {
    return "/api/books/:bookId/members/:actor/role";
  }

  if (/^\/api\/books\/[^/]+\/members\/[^/]+$/.test(path)) {
    return "/api/books/:bookId/members/:actor";
  }

  if (/^\/api\/books\/[^/]+\/approvals$/.test(path)) {
    return "/api/books/:bookId/approvals";
  }

  if (/^\/api\/books\/[^/]+\/approvals\/[^/]+\/grant$/.test(path)) {
    return "/api/books/:bookId/approvals/:approvalId/grant";
  }

  if (/^\/api\/books\/[^/]+\/approvals\/[^/]+\/deny$/.test(path)) {
    return "/api/books/:bookId/approvals/:approvalId/deny";
  }

  if (/^\/api\/books\/[^/]+\/audit-events$/.test(path)) {
    return "/api/books/:bookId/audit-events";
  }

  if (/^\/api\/books\/[^/]+\/accounts$/.test(path)) {
    return "/api/books/:bookId/accounts";
  }

  if (/^\/api\/books\/[^/]+\/accounts\/[^/]+$/.test(path)) {
    return "/api/books/:bookId/accounts/:accountId";
  }

  return path;
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
    bodylessPostRoute: Boolean(backupsCreateMatch || backupRestoreMatch || approvalGrantMatch || approvalDenyMatch),
    budgetLineMatch: path.match(/^\/api\/books\/([^/]+)\/budget-lines$/),
    closePeriodMatch: path.match(/^\/api\/books\/([^/]+)\/close-periods$/),
    csvImportMatch: path.match(/^\/api\/books\/([^/]+)\/imports\/csv$/),
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
    transactionMatch: path.match(/^\/api\/books\/([^/]+)\/transactions$/),
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
  };
}
