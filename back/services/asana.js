function normalizeDateInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatAsanaDate(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  return normalized.toISOString().slice(0, 10);
}

function computeDefaultTaskDueDate() {
  const dueDays = Number(process.env.REMEDIATION_TASK_DUE_DAYS || 2);
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + (Number.isFinite(dueDays) ? dueDays : 2));
  return base;
}

function isAsanaConfigured() {
  return Boolean(
    String(process.env.ASANA_ACCESS_TOKEN || "").trim() &&
      String(process.env.ASANA_WORKSPACE_GID || "").trim() &&
      String(process.env.ASANA_PROJECT_GID || "").trim()
  );
}

function buildAsanaHeaders() {
  return {
    Authorization: `Bearer ${String(process.env.ASANA_ACCESS_TOKEN || "").trim()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
}

async function getAsanaResource(url) {
  const { response, payload } = await fetchJson(url, {
    method: "GET",
    headers: buildAsanaHeaders(),
  });

  if (!response.ok) {
    return null;
  }

  return payload?.data || null;
}

async function listCurrentUserWorkspaces() {
  const data = await getAsanaResource(
    "https://app.asana.com/api/1.0/users/me/workspaces?opt_fields=gid,name,is_organization"
  );

  return Array.isArray(data) ? data : [];
}

async function getWorkspaceById(workspaceGid) {
  if (!workspaceGid) return null;
  return getAsanaResource(
    `https://app.asana.com/api/1.0/workspaces/${workspaceGid}?opt_fields=gid,name,is_organization,email_domains`
  );
}

async function getProjectById(projectGid) {
  if (!projectGid) return null;
  return getAsanaResource(
    `https://app.asana.com/api/1.0/projects/${projectGid}?opt_fields=gid,name,workspace.gid,workspace.name,team.name`
  );
}

async function resolveWorkspaceContext() {
  const configuredWorkspaceGid = String(process.env.ASANA_WORKSPACE_GID || "").trim();
  const configuredProjectGid = String(process.env.ASANA_PROJECT_GID || "").trim();

  const configuredWorkspace = await getWorkspaceById(configuredWorkspaceGid);
  const configuredProject = await getProjectById(configuredProjectGid);

  if (configuredWorkspace) {
    return {
      workspace: configuredWorkspace,
      project: configuredProject,
      usedWorkspaceFallback: false,
      usedProjectFallback: !configuredProject && Boolean(configuredProjectGid),
    };
  }

  if (configuredProject?.workspace?.gid) {
    const projectWorkspace = await getWorkspaceById(String(configuredProject.workspace.gid).trim());
    if (projectWorkspace) {
      return {
        workspace: projectWorkspace,
        project: configuredProject,
        usedWorkspaceFallback: true,
        usedProjectFallback: false,
      };
    }
  }

  const workspaces = await listCurrentUserWorkspaces();
  const fallbackWorkspace = workspaces[0] || null;

  return {
    workspace: fallbackWorkspace,
    project: null,
    usedWorkspaceFallback: Boolean(fallbackWorkspace),
    usedProjectFallback: Boolean(configuredProjectGid),
  };
}

async function listWorkspaceUsers(workspaceGid) {
  const users = [];
  let offset = null;
  let pageCount = 0;

  while (pageCount < 10) {
    const query = new URLSearchParams({
      limit: "100",
      opt_fields: "gid,name,email",
    });

    if (offset) {
      query.set("offset", offset);
    }

    const { response, payload } = await fetchJson(
      `https://app.asana.com/api/1.0/workspaces/${workspaceGid}/users?${query.toString()}`,
      {
        method: "GET",
        headers: buildAsanaHeaders(),
      }
    );

    if (!response.ok) {
      return [];
    }

    if (Array.isArray(payload?.data)) {
      users.push(...payload.data);
    }

    offset = payload?.next_page?.offset || null;
    if (!offset) break;
    pageCount += 1;
  }

  return users;
}

async function getCurrentAsanaUser() {
  const data = await getAsanaResource(
    "https://app.asana.com/api/1.0/users/me?opt_fields=gid,name,email"
  );
  return data || null;
}

async function resolveAsanaAssignee(email, workspaceGid) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !isAsanaConfigured() || !workspaceGid) {
    return null;
  }

  try {
    const users = await listWorkspaceUsers(workspaceGid);
    let match = users.find(
      (user) => String(user?.email || "").trim().toLowerCase() === normalizedEmail
    );

    if (!match) {
      const me = await getCurrentAsanaUser();
      if (String(me?.email || "").trim().toLowerCase() === normalizedEmail) {
        match = me;
      }
    }

    return match
      ? {
          gid: match.gid || null,
          email: match.email || null,
          name: match.name || null,
        }
      : null;
  } catch {
    return null;
  }
}

async function createAsanaRemediationTask(payload) {
  if (!isAsanaConfigured()) {
    return {
      created: false,
      skipped: true,
      syncStatus: "SKIPPED",
      message:
        "Asana is not configured in the running backend. Save ASANA_ACCESS_TOKEN, ASANA_WORKSPACE_GID, and ASANA_PROJECT_GID in back/.env, then restart the backend.",
      gid: null,
      url: null,
    };
  }

  const workspaceContext = await resolveWorkspaceContext();
  const workspaceGid = String(workspaceContext.workspace?.gid || "").trim();
  const projectGid = String(workspaceContext.project?.gid || "").trim();

  if (!workspaceGid) {
    return {
      created: false,
      skipped: false,
      syncStatus: "FAILED",
      message:
        "No accessible Asana workspace was found for the configured token. Update ASANA_WORKSPACE_GID or use a token from the correct Asana workspace.",
      gid: null,
      url: null,
    };
  }

  const assignee = payload.assigneeGid
    ? { gid: payload.assigneeGid, email: payload.assigneeEmail || null, name: null }
    : await resolveAsanaAssignee(payload.assigneeEmail, workspaceGid);
  const assigneeGid = assignee?.gid || null;
  const dueOn = formatAsanaDate(payload.dueDate || computeDefaultTaskDueDate());

  const requestBody = {
    data: {
      name: payload.name,
      notes: payload.notes,
      workspace: workspaceGid,
      due_on: dueOn,
    },
  };

  if (projectGid) {
    requestBody.data.projects = [projectGid];
  }

  if (assigneeGid) {
    requestBody.data.assignee = assigneeGid;
  }

  try {
    const { response, payload: body } = await fetchJson(
      "https://app.asana.com/api/1.0/tasks?opt_fields=gid,permalink_url,name",
      {
      method: "POST",
      headers: buildAsanaHeaders(),
      body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const message =
        body?.errors?.map((item) => item.message).filter(Boolean).join("; ") ||
        "Unable to create remediation task in Asana.";

      return {
        created: false,
        skipped: false,
        syncStatus: "FAILED",
        message,
        gid: null,
        url: null,
        assigneeGid,
        assigneeResolved: Boolean(assigneeGid),
        assigneeEmail: assignee?.email || payload.assigneeEmail || null,
        assigneeName: assignee?.name || null,
      };
    }

    const task = body?.data || {};
    const projectWarning = workspaceContext.usedProjectFallback
      ? "Configured Asana project ID was not valid, so the task was created in the workspace without attaching it to the configured project."
      : null;

    return {
      created: true,
      skipped: false,
      syncStatus: "SYNCED",
      message: projectWarning || "Task created in Asana.",
      gid: task.gid || null,
      url:
        task.permalink_url ||
        (task.gid ? `https://app.asana.com/0/${projectGid || workspaceGid}/${task.gid}` : null),
      assigneeGid,
      assigneeResolved: Boolean(assigneeGid),
      assigneeEmail: assignee?.email || payload.assigneeEmail || null,
      assigneeName: assignee?.name || null,
      assignmentMessage: assigneeGid
        ? `Assigned in Asana to ${assignee?.name || assignee?.email || "matched user"}.`
        : payload.assigneeEmail
          ? `Task created in Asana, but ${payload.assigneeEmail} is not available as an assignable member in the configured Asana workspace or project.`
          : "Task created in Asana without an assignee.",
      workspaceName: workspaceContext.workspace?.name || null,
      projectName: workspaceContext.project?.name || null,
      configurationWarning: projectWarning,
    };
  } catch (error) {
    return {
      created: false,
      skipped: false,
      syncStatus: "FAILED",
      message: String(error?.message || "Unable to reach Asana."),
      gid: null,
      url: null,
      assigneeGid,
      assigneeResolved: Boolean(assigneeGid),
      assigneeEmail: assignee?.email || payload.assigneeEmail || null,
      assigneeName: assignee?.name || null,
    };
  }
}

module.exports = {
  computeDefaultTaskDueDate,
  createAsanaRemediationTask,
  isAsanaConfigured,
};
