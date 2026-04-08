export interface HttpReadRouteMatches {
  accountsMatch: RegExpMatchArray | null;
  approvalsMatch: RegExpMatchArray | null;
  auditEventsMatch: RegExpMatchArray | null;
  backupsMatch: RegExpMatchArray | null;
  closePeriodsMatch: RegExpMatchArray | null;
  closeSummaryMatch: RegExpMatchArray | null;
  dashboardMatch: RegExpMatchArray | null;
  gnucashXmlExportMatch: RegExpMatchArray | null;
  householdMembersMatch: RegExpMatchArray | null;
  qifExportMatch: RegExpMatchArray | null;
  reportMatch: RegExpMatchArray | null;
  statementExportMatch: RegExpMatchArray | null;
  workspaceMatch: RegExpMatchArray | null;
}

export interface HttpPostRouteMatches {
  accountMatch: RegExpMatchArray | null;
  approvalGrantMatch: RegExpMatchArray | null;
  approvalDenyMatch: RegExpMatchArray | null;
  approvalRequestMatch: RegExpMatchArray | null;
  backupRestoreMatch: RegExpMatchArray | null;
  backupsCreateMatch: RegExpMatchArray | null;
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

  if (/^\/api\/workspaces\/[^/]+$/.test(path)) {
    return "/api/workspaces/:workspaceId";
  }

  if (/^\/api\/workspaces\/[^/]+\/dashboard$/.test(path)) {
    return "/api/workspaces/:workspaceId/dashboard";
  }

  if (/^\/api\/workspaces\/[^/]+\/reports\/[^/]+$/.test(path)) {
    return "/api/workspaces/:workspaceId/reports/:kind";
  }

  if (/^\/api\/workspaces\/[^/]+\/close-summary$/.test(path)) {
    return "/api/workspaces/:workspaceId/close-summary";
  }

  if (/^\/api\/workspaces\/[^/]+\/close-periods$/.test(path)) {
    return "/api/workspaces/:workspaceId/close-periods";
  }

  if (/^\/api\/workspaces\/[^/]+\/backups$/.test(path)) {
    return "/api/workspaces/:workspaceId/backups";
  }

  if (/^\/api\/workspaces\/[^/]+\/backups\/[^/]+\/restore$/.test(path)) {
    return "/api/workspaces/:workspaceId/backups/:backupId/restore";
  }

  if (/^\/api\/workspaces\/[^/]+\/transactions$/.test(path)) {
    return "/api/workspaces/:workspaceId/transactions";
  }

  if (/^\/api\/workspaces\/[^/]+\/transactions\/[^/]+\/destroy$/.test(path)) {
    return "/api/workspaces/:workspaceId/transactions/:transactionId/destroy";
  }

  if (/^\/api\/workspaces\/[^/]+\/transactions\/[^/]+$/.test(path)) {
    return "/api/workspaces/:workspaceId/transactions/:transactionId";
  }

  if (/^\/api\/workspaces\/[^/]+\/budget-lines$/.test(path)) {
    return "/api/workspaces/:workspaceId/budget-lines";
  }

  if (/^\/api\/workspaces\/[^/]+\/envelopes$/.test(path)) {
    return "/api/workspaces/:workspaceId/envelopes";
  }

  if (/^\/api\/workspaces\/[^/]+\/envelope-allocations$/.test(path)) {
    return "/api/workspaces/:workspaceId/envelope-allocations";
  }

  if (/^\/api\/workspaces\/[^/]+\/reconciliations$/.test(path)) {
    return "/api/workspaces/:workspaceId/reconciliations";
  }

  if (/^\/api\/workspaces\/[^/]+\/schedules$/.test(path)) {
    return "/api/workspaces/:workspaceId/schedules";
  }

  if (/^\/api\/workspaces\/[^/]+\/schedules\/[^/]+\/execute$/.test(path)) {
    return "/api/workspaces/:workspaceId/schedules/:scheduleId/execute";
  }

  if (/^\/api\/workspaces\/[^/]+\/schedules\/[^/]+\/exceptions$/.test(path)) {
    return "/api/workspaces/:workspaceId/schedules/:scheduleId/exceptions";
  }

  if (/^\/api\/workspaces\/[^/]+\/imports\/csv$/.test(path)) {
    return "/api/workspaces/:workspaceId/imports/csv";
  }

  if (/^\/api\/workspaces\/[^/]+\/imports\/qif$/.test(path)) {
    return "/api/workspaces/:workspaceId/imports/qif";
  }

  if (/^\/api\/workspaces\/[^/]+\/imports\/ofx$/.test(path)) {
    return "/api/workspaces/:workspaceId/imports/ofx";
  }

  if (/^\/api\/workspaces\/[^/]+\/imports\/qfx$/.test(path)) {
    return "/api/workspaces/:workspaceId/imports/qfx";
  }

  if (/^\/api\/workspaces\/[^/]+\/imports\/gnucash-xml$/.test(path)) {
    return "/api/workspaces/:workspaceId/imports/gnucash-xml";
  }

  if (/^\/api\/workspaces\/[^/]+\/exports\/qif$/.test(path)) {
    return "/api/workspaces/:workspaceId/exports/qif";
  }

  if (/^\/api\/workspaces\/[^/]+\/exports\/ofx$/.test(path)) {
    return "/api/workspaces/:workspaceId/exports/ofx";
  }

  if (/^\/api\/workspaces\/[^/]+\/exports\/qfx$/.test(path)) {
    return "/api/workspaces/:workspaceId/exports/qfx";
  }

  if (/^\/api\/workspaces\/[^/]+\/exports\/gnucash-xml$/.test(path)) {
    return "/api/workspaces/:workspaceId/exports/gnucash-xml";
  }

  if (/^\/api\/workspaces\/[^/]+\/members$/.test(path)) {
    return "/api/workspaces/:workspaceId/members";
  }

  if (/^\/api\/workspaces\/[^/]+\/members\/[^/]+\/role$/.test(path)) {
    return "/api/workspaces/:workspaceId/members/:actor/role";
  }

  if (/^\/api\/workspaces\/[^/]+\/members\/[^/]+$/.test(path)) {
    return "/api/workspaces/:workspaceId/members/:actor";
  }

  if (/^\/api\/workspaces\/[^/]+\/approvals$/.test(path)) {
    return "/api/workspaces/:workspaceId/approvals";
  }

  if (/^\/api\/workspaces\/[^/]+\/approvals\/[^/]+\/grant$/.test(path)) {
    return "/api/workspaces/:workspaceId/approvals/:approvalId/grant";
  }

  if (/^\/api\/workspaces\/[^/]+\/approvals\/[^/]+\/deny$/.test(path)) {
    return "/api/workspaces/:workspaceId/approvals/:approvalId/deny";
  }

  if (/^\/api\/workspaces\/[^/]+\/audit-events$/.test(path)) {
    return "/api/workspaces/:workspaceId/audit-events";
  }

  if (/^\/api\/workspaces\/[^/]+\/accounts$/.test(path)) {
    return "/api/workspaces/:workspaceId/accounts";
  }

  if (/^\/api\/workspaces\/[^/]+\/accounts\/[^/]+$/.test(path)) {
    return "/api/workspaces/:workspaceId/accounts/:accountId";
  }

  return path;
}

export function matchHttpReadRoutes(path: string): HttpReadRouteMatches {
  return {
    accountsMatch: path.match(/^\/api\/workspaces\/([^/]+)\/accounts$/),
    approvalsMatch: path.match(/^\/api\/workspaces\/([^/]+)\/approvals$/),
    auditEventsMatch: path.match(/^\/api\/workspaces\/([^/]+)\/audit-events$/),
    backupsMatch: path.match(/^\/api\/workspaces\/([^/]+)\/backups$/),
    closePeriodsMatch: path.match(/^\/api\/workspaces\/([^/]+)\/close-periods$/),
    closeSummaryMatch: path.match(/^\/api\/workspaces\/([^/]+)\/close-summary$/),
    dashboardMatch: path.match(/^\/api\/workspaces\/([^/]+)\/dashboard$/),
    gnucashXmlExportMatch: path.match(/^\/api\/workspaces\/([^/]+)\/exports\/gnucash-xml$/),
    householdMembersMatch: path.match(/^\/api\/workspaces\/([^/]+)\/members$/),
    qifExportMatch: path.match(/^\/api\/workspaces\/([^/]+)\/exports\/qif$/),
    reportMatch: path.match(/^\/api\/workspaces\/([^/]+)\/reports\/([^/]+)$/),
    statementExportMatch: path.match(/^\/api\/workspaces\/([^/]+)\/exports\/(ofx|qfx)$/),
    workspaceMatch: path.match(/^\/api\/workspaces\/([^/]+)$/),
  };
}

export function matchHttpPostRoutes(path: string): HttpPostRouteMatches {
  const backupsCreateMatch = path.match(/^\/api\/workspaces\/([^/]+)\/backups$/);
  const backupRestoreMatch = path.match(/^\/api\/workspaces\/([^/]+)\/backups\/([^/]+)\/restore$/);
  const approvalGrantMatch = path.match(/^\/api\/workspaces\/([^/]+)\/approvals\/([^/]+)\/grant$/);
  const approvalDenyMatch = path.match(/^\/api\/workspaces\/([^/]+)\/approvals\/([^/]+)\/deny$/);

  return {
    accountMatch: path.match(/^\/api\/workspaces\/([^/]+)\/accounts$/),
    approvalGrantMatch,
    approvalDenyMatch,
    approvalRequestMatch: path.match(/^\/api\/workspaces\/([^/]+)\/approvals$/),
    backupRestoreMatch,
    backupsCreateMatch,
    bodylessPostRoute: Boolean(backupsCreateMatch || backupRestoreMatch || approvalGrantMatch || approvalDenyMatch),
    budgetLineMatch: path.match(/^\/api\/workspaces\/([^/]+)\/budget-lines$/),
    closePeriodMatch: path.match(/^\/api\/workspaces\/([^/]+)\/close-periods$/),
    csvImportMatch: path.match(/^\/api\/workspaces\/([^/]+)\/imports\/csv$/),
    envelopeAllocationMatch: path.match(/^\/api\/workspaces\/([^/]+)\/envelope-allocations$/),
    envelopeMatch: path.match(/^\/api\/workspaces\/([^/]+)\/envelopes$/),
    exceptionScheduleMatch: path.match(/^\/api\/workspaces\/([^/]+)\/schedules\/([^/]+)\/exceptions$/),
    executeScheduleMatch: path.match(/^\/api\/workspaces\/([^/]+)\/schedules\/([^/]+)\/execute$/),
    gnucashXmlImportMatch: path.match(/^\/api\/workspaces\/([^/]+)\/imports\/gnucash-xml$/),
    householdMemberMatch: path.match(/^\/api\/workspaces\/([^/]+)\/members$/),
    qifImportMatch: path.match(/^\/api\/workspaces\/([^/]+)\/imports\/qif$/),
    reconciliationMatch: path.match(/^\/api\/workspaces\/([^/]+)\/reconciliations$/),
    scheduleMatch: path.match(/^\/api\/workspaces\/([^/]+)\/schedules$/),
    statementImportMatch: path.match(/^\/api\/workspaces\/([^/]+)\/imports\/(ofx|qfx)$/),
    transactionMatch: path.match(/^\/api\/workspaces\/([^/]+)\/transactions$/),
  };
}

export function matchHttpPutRoutes(path: string): HttpPutRouteMatches {
  return {
    putTransactionMatch: path.match(/^\/api\/workspaces\/([^/]+)\/transactions\/([^/]+)$/),
    setHouseholdMemberRoleMatch: path.match(/^\/api\/workspaces\/([^/]+)\/members\/([^/]+)\/role$/),
  };
}

export function matchHttpDeleteRoutes(path: string): HttpDeleteRouteMatches {
  return {
    archiveAccountMatch: path.match(/^\/api\/workspaces\/([^/]+)\/accounts\/([^/]+)$/),
    deleteTransactionMatch: path.match(/^\/api\/workspaces\/([^/]+)\/transactions\/([^/]+)$/),
    destroyTransactionMatch: path.match(/^\/api\/workspaces\/([^/]+)\/transactions\/([^/]+)\/destroy$/),
    removeHouseholdMemberMatch: path.match(/^\/api\/workspaces\/([^/]+)\/members\/([^/]+)$/),
  };
}
