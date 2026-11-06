/**
 * `dsh-mcp-autoload`, browser half: mounts the `mcpAutoload` Remote
 * contribution, then registers an MCP inventory trigger into the conversation
 * composer dock (`conversation.composer.dock`). Clicking it opens a popover
 * listing every MCP server mounted for the current session — project-level
 * (from `.agents/mcp.json`) and user-level (profile-configured) — with each
 * server's registered tools, descriptions, and parameter schemas.
 *
 * The popover matches the host's Token-usage surface: a portaled fixed panel
 * anchored above its trigger by the shared UI primitives, host theme tokens
 * only, no app-root replacement.
 *
 * React, react-dom and the UI primitives come from the frozen module table's
 * seed words (`require`), so no duplicate installation and no
 * `dsh.client.external` edge. The wire invocation descriptor below is
 * mirrored by `wire.js` on the host side.
 */

window.__ModuleLoader__.load({
  id: 'dsh-mcp-autoload',
  factory(require) {
    const React = require('react');
    const ReactDom = require('react-dom');
    const Primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement;

    const name = 'dsh-mcp-autoload';
    const inject = ['slots', 'locale', 'remote', 'sessions'];

    // ---- Wire descriptor (mirrors wire.js on the host; hand-written identity
    // codecs satisfy the gateway mount's structural checks without zod) ----

    const MCP_TOOL_VIEW_JSON = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        parametersJson: { type: 'string' },
      },
      required: ['name', 'description', 'parametersJson'],
      additionalProperties: false,
    };

    const MCP_SERVER_VIEW_JSON = {
      type: 'object',
      properties: {
        serverName: { type: 'string' },
        rawName: { type: 'string' },
        origin: { type: 'string', enum: ['project', 'user'] },
        enabled: { type: 'boolean' },
        mounted: { type: 'boolean' },
        mountError: { type: 'string' },
        transport: { type: 'string' },
        target: { type: 'string' },
        toolCount: { type: 'number' },
        tools: { type: 'array', items: MCP_TOOL_VIEW_JSON },
      },
      required: ['serverName', 'rawName', 'origin', 'enabled', 'mounted', 'mountError', 'transport', 'target', 'toolCount', 'tools'],
      additionalProperties: false,
    };

    const MCP_AUTOLOAD_SNAPSHOT_JSON = {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        manifestPath: { type: ['string', 'null'] },
        loading: { type: 'boolean' },
        servers: { type: 'array', items: MCP_SERVER_VIEW_JSON },
      },
      required: ['sessionId', 'manifestPath', 'loading', 'servers'],
      additionalProperties: false,
    };

    function strictCodec(typeSymbol, jsonSchema) {
      return {
        mode: 'strict',
        typeSymbol,
        jsonSchema,
        create: () => ({ parse: (value) => value }),
      };
    }

    const MCP_AUTOLOAD_INVOCATIONS = Object.freeze([
      Object.freeze({
        id: 'dsh-mcp-autoload#mcpAutoload/status',
        service: 'mcpAutoload',
        namespace: 'mcpAutoload',
        method: 'status',
        invocation: Object.freeze({ kind: 'direct' }),
        parameters: Object.freeze([
          Object.freeze({
            name: 'sessionId',
            wire: 'sessionId',
            source: 'json',
            description: 'Session whose mounted MCP servers and tools are listed.',
            codec: strictCodec('dsh-mcp-autoload/types#SessionId', { type: 'string' }),
          }),
        ]),
        result: Object.freeze(strictCodec('dsh-mcp-autoload/types#McpAutoloadSnapshot', MCP_AUTOLOAD_SNAPSHOT_JSON)),
        sourceLocation: Object.freeze({ file: 'client.js', line: 1, column: 1 }),
      }),
      Object.freeze({
        id: 'dsh-mcp-autoload#mcpAutoload/setEnabled',
        service: 'mcpAutoload',
        namespace: 'mcpAutoload',
        method: 'setEnabled',
        invocation: Object.freeze({ kind: 'direct' }),
        parameters: Object.freeze([
          Object.freeze({ name: 'sessionId', wire: 'sessionId', source: 'json', description: 'Session whose project MCP servers are managed.', codec: strictCodec('dsh-mcp-autoload/types#SessionId', { type: 'string' }) }),
          Object.freeze({ name: 'rawName', wire: 'rawName', source: 'json', description: 'Original project manifest key.', codec: strictCodec('dsh-mcp-autoload/types#RawServerName', { type: 'string' }) }),
          Object.freeze({ name: 'enabled', wire: 'enabled', source: 'json', description: 'Whether the project MCP server should be enabled.', codec: strictCodec('dsh-mcp-autoload/types#Enabled', { type: 'boolean' }) }),
        ]),
        result: Object.freeze(strictCodec('dsh-mcp-autoload/types#McpAutoloadToggleResult', {
          type: 'object',
          properties: {
            changed: { type: 'boolean' },
            enabled: { type: 'boolean' },
            backupPath: { type: 'string' },
          },
          required: ['changed'],
          additionalProperties: false,
        })),
        sourceLocation: Object.freeze({ file: 'client.js', line: 1, column: 1 }),
      }),
    ]);

    const MCP_AUTOLOAD_REMOTE = Object.freeze({
      package: 'dsh-mcp-autoload',
      descriptors: MCP_AUTOLOAD_INVOCATIONS,
    });

    // ---- Locales ----

    const NS = 'conversation.mcpAutoload';

    const DICTS = {
      en: {
        trigger: 'MCP servers',
        title: 'MCP servers',
        project: 'project',
        user: 'user',
        noServers: 'No MCP servers mounted for this session.',
        tools: 'tools',
        tool: 'tool',
        parameters: 'Parameters',
        required: 'required',
        oneOf: 'One of',
        defaultValue: 'default',
        noParams: 'No parameters',
        input: 'input',
        manifest: 'Manifest',
        transport: 'transport',
        refresh: 'Refresh',
        error: 'Failed to load MCP inventory',
        originProject: 'Project-level (from .agents/mcp.json)',
        originUser: 'User-level (profile configuration)',
        enabled: 'Enabled',
        disabled: 'Disabled',
        retry: 'Retry',
        disabledState: 'Disabled',
        enable: 'Enable',
        disable: 'Disable',
        toggleFailed: 'Failed to change MCP server',
        toggleDone: 'MCP server updated. Backup: ',
        mountFailed: 'Connection failed',
        connected: 'Connected',
        mountFailedState: 'Mount failed',
        connecting: 'Connecting…',
        noTools: 'No tools',
        noToolsHint: 'This server registered no tools, or it is still reconnecting after a failed first connection.',
      },
      zh: {
        trigger: 'MCP 服务器',
        title: 'MCP 服务器',
        project: '项目级',
        user: '用户级',
        noServers: '当前会话未挂载 MCP 服务器。',
        tools: '个工具',
        tool: '个工具',
        parameters: '参数',
        required: '必填',
        oneOf: '可选值',
        defaultValue: '默认',
        noParams: '无参数',
        input: '输入',
        manifest: '配置文件',
        transport: '传输',
        refresh: '刷新',
        error: '加载 MCP 清单失败',
        originProject: '项目级（来自 .agents/mcp.json）',
        originUser: '用户级（profile 配置）',
        enabled: '已启用',
        disabled: '已禁用',
        retry: '重试连接',
        disabledState: '已禁用',
        enable: '启用',
        disable: '禁用',
        toggleFailed: '修改 MCP 状态失败',
        toggleDone: '已更新 MCP。备份：',
        mountFailed: '连接失败',
        connected: '已连接',
        mountFailedState: '挂载失败',
        connecting: '连接中…',
        noTools: '无工具',
        noToolsHint: '该 server 未注册任何工具，或首次连接失败后仍在后台重连。',
      },
    };

    // ---- Styles (host tokens only; scoped under the plugin's data attribute) ----

    let liveInstalls = 0;

    function installStyles() {
      let disposed = false;
      liveInstalls += 1;
      let element = document.querySelector('style[data-dsh-mcp-autoload-css]');
      if (element === null) {
        element = document.createElement('style');
        element.dataset.dshMcpAutoloadCss = '';
        element.textContent = CSS;
        document.head.append(element);
      }
      return () => {
        if (disposed) return;
        disposed = true;
        liveInstalls -= 1;
        if (liveInstalls <= 0) {
          liveInstalls = 0;
          element?.remove();
        }
      };
    }

    const CSS = `
[data-dsh-mcp-autoload] {
  display: inline-flex;
  flex: none;
}
[data-dsh-mcp-autoload] .dma-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 1px 8px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  font-variant-numeric: tabular-nums;
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
  white-space: nowrap;
  cursor: pointer;
}
[data-dsh-mcp-autoload] .dma-trigger svg {
  width: 14px;
  height: 14px;
  flex: none;
}
/* "Connected n/N" next to the trigger: per-server state, not an overall spinner. */
[data-dsh-mcp-autoload] .dma-trigger-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
/* Small state dot; the tone modifier picks the colour. */
[data-dsh-mcp-autoload] .dma-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary);
}
[data-dsh-mcp-autoload] .dma-dot-ok {
  background: var(--dsw-alias-state-success-primary);
}
[data-dsh-mcp-autoload] .dma-dot-pending {
  background: var(--dsw-alias-state-warn-primary);
}
[data-dsh-mcp-autoload] .dma-dot-error {
  background: var(--dsw-alias-state-error-primary);
}
/* Spinner: the shared Primitives loading-outline glyph, turned by CSS. */
@keyframes dsh-mcp-autoload-spin {
  to { transform: rotate(360deg); }
}
[data-dsh-mcp-autoload] .dma-spin {
  flex: none;
  animation: dsh-mcp-autoload-spin 0.9s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  [data-dsh-mcp-autoload] .dma-spin {
    animation: none;
  }
}
[data-dsh-mcp-autoload] .dma-trigger[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
@media (hover: hover) {
  [data-dsh-mcp-autoload] .dma-trigger:hover {
    background: var(--dsw-alias-interactive-bg-hover);
    color: var(--dsw-alias-label-secondary);
  }
}
/* Portaled surface: the data attribute travels with it so the sheet applies. */
[data-dsh-mcp-autoload].dma-panel,
[data-dsh-mcp-autoload] .dma-panel {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100vw - 24px));
  max-height: min(70vh, 480px);
  padding: 12px;
  border: 0;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  font-size: 12px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
  cursor: default;
}
[data-dsh-mcp-autoload] .dma-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
[data-dsh-mcp-autoload] .dma-head-title {
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-mcp-autoload] .dma-head-count {
  margin-left: auto;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-mcp-autoload] .dma-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  margin-top: 4px;
}
[data-dsh-mcp-autoload] .dma-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-tertiary);
}
[data-dsh-mcp-autoload] .dma-path-none {
  flex: 1 1 auto;
  color: var(--dsw-alias-label-tertiary);
}
[data-dsh-mcp-autoload] .dma-refresh {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  font: inherit;
  font-size: 12px;
  padding: 1px 6px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
[data-dsh-mcp-autoload] .dma-refresh[disabled] {
  cursor: default;
  opacity: 0.5;
}
@media (hover: hover) {
  [data-dsh-mcp-autoload] .dma-refresh:not([disabled]):hover {
    background: var(--dsw-alias-interactive-bg-hover);
    color: var(--dsw-alias-label-secondary);
  }
}
[data-dsh-mcp-autoload] .dma-rule {
  flex: none;
  height: 1px;
  margin: 10px 0;
  background: var(--dsw-alias-border-l1);
}
[data-dsh-mcp-autoload] .dma-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
[data-dsh-mcp-autoload] .dma-server {
  padding: 8px 0;
}
[data-dsh-mcp-autoload] .dma-server:first-child {
  padding-top: 0;
}
[data-dsh-mcp-autoload] .dma-server:last-child {
  padding-bottom: 0;
}
[data-dsh-mcp-autoload] .dma-server + .dma-server {
  border-top: 1px solid var(--dsw-alias-border-l1);
}
[data-dsh-mcp-autoload] .dma-server-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
[data-dsh-mcp-autoload] .dma-server-name {
  min-width: 0;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}
[data-dsh-mcp-autoload] .dma-badge {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}
[data-dsh-mcp-autoload] .dma-badge-project {
  border-color: var(--dsw-alias-state-success-primary);
  color: var(--dsw-alias-state-success-primary);
}
[data-dsh-mcp-autoload] .dma-server-toggle {
  flex: none;
  margin-left: auto;
  padding: 1px 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  cursor: pointer;
}
[data-dsh-mcp-autoload] .dma-server-toggle[disabled] {
  cursor: default;
  opacity: 0.5;
}
[data-dsh-mcp-autoload] .dma-server-state {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary);
}
[data-dsh-mcp-autoload] .dma-server-error {
  margin-top: 2px;
  color: var(--dsw-alias-state-error-primary);
  overflow-wrap: anywhere;
}
[data-dsh-mcp-autoload] .dma-target {
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary);
  overflow-wrap: anywhere;
}
[data-dsh-mcp-autoload] .dma-tools {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  /* A server with many tools must not stretch the whole popover. */
  max-height: 240px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
[data-dsh-mcp-autoload] .dma-tool > summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  margin: 0 -6px;
  border-radius: var(--dsw-radius-sm);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  list-style: none;
  user-select: none;
}
[data-dsh-mcp-autoload] .dma-tool > summary::-webkit-details-marker {
  display: none;
}
[data-dsh-mcp-autoload] .dma-tool > summary::before {
  content: '▸';
  flex: none;
  width: 10px;
  font-size: 9px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
}
[data-dsh-mcp-autoload] .dma-tool[open] > summary::before {
  content: '▾';
}
@media (hover: hover) {
  [data-dsh-mcp-autoload] .dma-tool > summary:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }
}
[data-dsh-mcp-autoload] .dma-tool-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
[data-dsh-mcp-autoload] .dma-tool-body {
  padding: 4px 6px 6px 16px;
}
[data-dsh-mcp-autoload] .dma-tool-desc {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  overflow-wrap: anywhere;
}
[data-dsh-mcp-autoload] .dma-tool-params-label {
  margin: 8px 0 4px;
  color: var(--dsw-alias-label-tertiary);
}
[data-dsh-mcp-autoload] .dma-params {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
[data-dsh-mcp-autoload] .dma-param {
  min-width: 0;
}
[data-dsh-mcp-autoload] .dma-param-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
[data-dsh-mcp-autoload] .dma-param-name {
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}
[data-dsh-mcp-autoload] .dma-param-type {
  flex: none;
  margin-left: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}
[data-dsh-mcp-autoload] .dma-param-type-required {
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-mcp-autoload] .dma-param-desc {
  margin-top: 1px;
  color: var(--dsw-alias-label-tertiary);
  overflow-wrap: anywhere;
}
[data-dsh-mcp-autoload] .dma-param-meta {
  margin-top: 1px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  overflow-wrap: anywhere;
}
[data-dsh-mcp-autoload] .dma-params-nested {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 6px 0 0 4px;
  padding-left: 8px;
  border-left: 1px solid var(--dsw-alias-border-l1);
}
[data-dsh-mcp-autoload] .dma-note {
  color: var(--dsw-alias-label-tertiary);
}
[data-dsh-mcp-autoload] .dma-error {
  color: var(--dsw-alias-state-error-primary);
  overflow-wrap: anywhere;
}
`;

    // ---- Parameter schema → readable field rows ----

    /** Short type label for one JSON Schema node. */
    function typeLabel(schema) {
      if (schema === null || typeof schema !== 'object') return 'any';
      if (typeof schema.$ref === 'string') return schema.$ref.split('/').pop();
      if (Array.isArray(schema.anyOf)) return schema.anyOf.map(typeLabel).join(' | ');
      if (Array.isArray(schema.oneOf)) return schema.oneOf.map(typeLabel).join(' | ');
      const type = schema.type;
      if (type === 'array') return `array<${typeLabel(schema.items)}>`;
      if (Array.isArray(type)) return type.join(' | ');
      if (typeof type === 'string') return type;
      if (schema.properties !== undefined) return 'object';
      if (Array.isArray(schema.enum)) return 'enum';
      return 'any';
    }

    /** Flatten one schema node's object properties into display rows (recursive). */
    function paramRows(schema) {
      if (schema === null || typeof schema !== 'object') return [];
      const props = schema.properties;
      if (props === null || typeof props !== 'object' || Array.isArray(props)) return [];
      const required = new Set(Array.isArray(schema.required) ? schema.required : []);
      return Object.entries(props).map(([key, sub]) => {
        const node = sub !== null && typeof sub === 'object' ? sub : {};
        return {
          name: key,
          type: typeLabel(node),
          required: required.has(key),
          description: typeof node.description === 'string' ? node.description : '',
          values: Array.isArray(node.enum) ? node.enum : [],
          hasDefault: Object.prototype.hasOwnProperty.call(node, 'default'),
          defaultValue: node.default,
          children: paramRows(node),
        };
      });
    }

    /** Render one field row, with nested object fields indented beneath it. */
    function ParamRow(t, field, depth) {
      const meta = [];
      if (field.values.length > 0) meta.push(`${t('oneOf')} ${field.values.map(value => JSON.stringify(value)).join(' | ')}`);
      if (field.hasDefault) meta.push(`${t('defaultValue')} ${JSON.stringify(field.defaultValue)}`);
      const typeText = field.required ? `${field.type} · ${t('required')}` : field.type;
      const children = field.children.length > 0
        ? h('div', { className: 'dma-params-nested' }, field.children.map(child => ParamRow(t, child, depth + 1)))
        : null;
      return h('div', { key: `${depth}:${field.name}`, className: 'dma-param' },
        h('div', { className: 'dma-param-head' },
          h('span', { className: 'dma-param-name' }, field.name),
          h('span', {
            className: field.required ? 'dma-param-type dma-param-type-required' : 'dma-param-type',
          }, typeText)),
        field.description ? h('div', { className: 'dma-param-desc' }, field.description) : null,
        meta.length > 0 ? h('div', { className: 'dma-param-meta' }, meta.join(' · ')) : null,
        children);
    }

    function safeParse(text) {
      try { return JSON.parse(text); } catch { return undefined; }
    }

    function ToolRow(t, tool) {
      const schema = safeParse(tool.parametersJson);
      const fields = paramRows(schema);
      const body = [];
      if (tool.description) body.push(h('p', { key: 'desc', className: 'dma-tool-desc' }, tool.description));
      if (fields.length > 0) {
        body.push(h('p', { key: 'label', className: 'dma-tool-params-label' }, t('parameters')));
        body.push(h('div', { key: 'fields', className: 'dma-params' }, fields.map(field => ParamRow(t, field, 0))));
      } else if (schema !== undefined && Object.keys(schema).length > 0) {
        // A schema without object properties (free-form, arrays, unions): one line.
        body.push(h('p', { key: 'label', className: 'dma-tool-params-label' }, t('parameters')));
        body.push(h('div', { key: 'flat', className: 'dma-param' },
          h('div', { className: 'dma-param-head' },
            h('span', { className: 'dma-param-name' }, t('input')),
            h('span', { className: 'dma-param-type' }, typeLabel(schema)))));
      } else if (schema !== undefined) {
        body.push(h('p', { key: 'none', className: 'dma-tool-params-label' }, t('noParams')));
      }
      return h('li', { key: tool.name, className: 'dma-tool' },
        h('details', null,
          h('summary', null, h('span', { className: 'dma-tool-name' }, tool.name)),
          body.length > 0 ? h('div', { className: 'dma-tool-body' }, body) : null));
    }

    /**
     * Per-server connection state. The trigger and the rows both read this, so
     * "connected" always means one thing: enabled, mounted, no mount error.
     */
    function serverState(t, server) {
      if (!server.enabled) return { tone: 'off', text: t('disabledState') };
      // Error first: the host records a failed handshake as `mounted: false`
      // plus `mountError`, so testing `!mounted` first would label a server
      // that just failed as "connecting".
      if (server.mountError) return { tone: 'error', text: t('mountFailedState') };
      if (!server.mounted) return { tone: 'pending', text: t('connecting') };
      if (server.toolCount > 0) {
        return { tone: 'ok', text: `${t('connected')} · ${server.toolCount} ${server.toolCount === 1 ? t('tool') : t('tools')}` };
      }
      // Mounted yet tool-less is ambiguous on purpose: either the server really
      // registers nothing, or its first connect failed and it is retrying.
      return { tone: 'idle', text: t('noTools'), title: t('noToolsHint') };
    }

    function ServerGroup(t, server, busy, onToggle) {
      const isProject = server.origin === 'project';
      const retrying = server.enabled && !server.mounted;
      const label = retrying ? t('retry') : server.enabled ? t('disable') : t('enable');
      const state = serverState(t, server);
      return h('div', { key: `${server.origin}:${server.rawName || server.serverName}`, className: 'dma-server' },
        h('div', { className: 'dma-server-head' },
          h('span', { className: 'dma-server-name' }, server.rawName || server.serverName),
          h('span', {
            className: `dma-badge${isProject ? ' dma-badge-project' : ''}`,
            title: isProject ? t('originProject') : t('originUser'),
          }, isProject ? t('project') : t('user')),
          isProject && server.rawName
            ? h('button', {
                type: 'button',
                className: 'dma-server-toggle',
                disabled: busy,
                'aria-label': `${label} ${server.rawName || server.serverName}`,
                'aria-pressed': server.enabled,
                onClick: () => onToggle(server),
              }, busy ? '…' : label)
            : null),
        h('div', { className: 'dma-server-state', title: state.title },
          h('span', { className: `dma-dot dma-dot-${state.tone}`, 'aria-hidden': 'true' }),
          h('span', null, state.text)),
        server.target
          ? h('div', { className: 'dma-target' }, `${t('transport')}: ${server.transport} · ${server.target}`)
          : null,
        server.mountError
          ? h('div', { className: 'dma-server-error' }, `${t('mountFailed')}: ${server.mountError}`)
          : null,
        server.tools.length > 0
          ? h('ul', { className: 'dma-tools' }, server.tools.map(tool => ToolRow(t, tool)))
          : null);
    }

    /** The shared Primitives loading glyph; `.dma-spin` rotates it (see CSS). */
    function LoadingSpinner(size = 14) {
      return h(Primitives.IconLoadingOutlineRegular, { size, className: 'dma-spin' });
    }

    // `snapshot.loading` means the host has not finished discovering and
    // mounting this session's project servers, so `servers` may still be empty
    // for a session that will end up having some. `status` is a read-only
    // query, so re-querying is the only safe recovery: back off through these
    // delays and stop at the first answer the host reports as settled.
    const STATUS_RETRY_DELAYS_MS = [400, 900, 1800, 3000];
    // A session that is still loading when one retry chain is spent keeps its
    // spinner, but auto-restarts the chain at most this many times — and only
    // while the panel is open — so a slow mount can still settle on its own
    // without turning into unbounded polling.
    const STATUS_LOADING_CHAIN_LIMIT = 3;

    /** The dock trigger plus its portaled popover. Receives the framework standard kit. */
    function McpAutoloadTrigger(props, t, remoteApi) {
      const sessionId = props.sessionId;
      const [open, setOpen] = React.useState(false);
      const [snapshot, setSnapshot] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [toggleError, setToggleError] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      // Bumped by every `load`; a chain whose token is stale exits silently so
      // reopening the panel cannot stack concurrent queries.
      const loadTokenRef = React.useRef(0);
      // Token of the chain that currently owns `busy`, or 0 when nobody does.
      // Only the owner may clear it: guarding on `loadTokenRef` alone would
      // strand `busy` forever when a background `load(false)` (opening the
      // panel, or the self-heal poll) supersedes a `load(true)`. A `toggle`
      // owns it through a symbol of its own, so no load chain can clear it.
      const busyTokenRef = React.useRef(0);
      // False once this trigger unmounted or its session changed: an in-flight
      // `toggle` must not paint state into a component that is gone.
      const aliveRef = React.useRef(true);
      // The session this trigger currently renders. `aliveRef` only says the
      // component exists; a `toggle` started for a previous session must also
      // not paint its notice into the new session's panel.
      const sessionRef = React.useRef(sessionId);
      sessionRef.current = sessionId;
      // Mirrors `open` for `load`'s self-heal timer without making `load`
      // change identity (which would re-run the mount effect).
      const openRef = React.useRef(false);
      // Consecutive retry chains that ended while still `loading`, and the
      // pending self-heal timer; both reset as soon as the host settles.
      const chainRef = React.useRef(0);
      const retryTimerRef = React.useRef(null);
      const available = sessionId !== undefined;

      const position = Primitives.useAnchoredPosition({
        open: open && available,
        anchorRef: rootRef,
        panelRef,
        side: 'top',
        align: 'end',
        gap: 8,
        margin: 12,
      });
      Primitives.useDismissOnOutsidePointer(rootRef, open && available, setOpen, panelRef);

      const load = React.useCallback(async (showBusy = true) => {
        if (sessionId === undefined) return;
        const token = ++loadTokenRef.current;
        if (retryTimerRef.current !== null) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        if (showBusy && busyTokenRef.current === 0) {
          // Never steal `busy` from a running toggle: the toggle owns it until
          // its own remote call settles.
          busyTokenRef.current = token;
          setBusy(true);
        }
        try {
          let result = await remoteApi.status(sessionId);
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
          for (const delay of STATUS_RETRY_DELAYS_MS) {
            // `loading` is the host's own "discovery has not finished" flag, so
            // it beats the old empty-list heuristic: a partial list is not an
            // answer yet — but it is already worth painting, because the host
            // lists every registered server at once and then connects them one
            // by one. Commit each answer so rows and their states move on their
            // own instead of waiting for the whole chain to settle.
            if (!result.value.loading) break;
            if (token !== loadTokenRef.current) return;
            setSnapshot(result.value);
            setError(null);
            await new Promise((resolve) => { setTimeout(resolve, delay); });
            if (token !== loadTokenRef.current) return;
            result = await remoteApi.status(sessionId);
            if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
          }
          if (token !== loadTokenRef.current) return;
          setSnapshot(result.value);
          setError(null);
          if (!result.value.loading) {
            chainRef.current = 0;
          } else if (openRef.current && chainRef.current < STATUS_LOADING_CHAIN_LIMIT) {
            // Still mounting after a full chain: keep polling, but only while
            // the panel is open and only for a bounded number of chains.
            chainRef.current += 1;
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              void load(false);
            }, STATUS_RETRY_DELAYS_MS[STATUS_RETRY_DELAYS_MS.length - 1]);
          }
        } catch (cause) {
          if (token !== loadTokenRef.current) return;
          setError(String(cause?.message ?? cause));
        } finally {
          // Only the chain that raised `busy` may lower it; a superseded chain
          // must not clear the flag of the load that replaced it.
          if (busyTokenRef.current === token) {
            busyTokenRef.current = 0;
            setBusy(false);
          }
        }
      }, [sessionId, remoteApi]);

      const toggle = React.useCallback(async (server) => {
        if (server.origin !== 'project' || !server.rawName || sessionId === undefined || busy) return;
        const retrying = server.enabled && !server.mounted;
        const enabled = retrying || !server.enabled;
        // No confirmation dialog in either direction: the toggle is a
        // reversible switch, the manifest write is locked and backed up, and
        // the row's own state plus the notice/error below is the feedback.
        // This toggle owns `busy` through a symbol, so a load chain settling
        // meanwhile can never clear the flag of a toggle that is still running.
        const owner = Symbol('toggle');
        busyTokenRef.current = owner;
        setBusy(true);
        setToggleError(null);
        setNotice(null);
        try {
          const result = await remoteApi.setEnabled(sessionId, server.rawName, enabled);
          if (!aliveRef.current || sessionRef.current !== sessionId) return;
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
          setNotice(result.value.backupPath ? `${t('toggleDone')} ${result.value.backupPath}` : t(enabled ? 'enabled' : 'disabled'));
          await load(false);
        } catch (cause) {
          if (!aliveRef.current || sessionRef.current !== sessionId) return;
          setToggleError(`${t('toggleFailed')}: ${String(cause?.message ?? cause)}`);
          await load(false);
        } finally {
          if (busyTokenRef.current === owner) {
            busyTokenRef.current = 0;
            if (aliveRef.current) setBusy(false);
          }
        }
      }, [sessionId, busy, remoteApi, load, t]);

      // Load once per session so the trigger can show the count before opening.
      React.useEffect(() => { void load(); }, [load]);

      // Re-query whenever the panel opens: the initial load can race a lazy
      // session resume or a still-running mount, and this is what un-sticks a
      // panel that would otherwise sit on its loading indicator. Closing the
      // panel drops any pending self-heal poll and its chain budget.
      React.useEffect(() => {
        openRef.current = open;
        if (open) {
          void load(false);
          return undefined;
        }
        if (retryTimerRef.current !== null) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        chainRef.current = 0;
        return undefined;
      }, [open, load]);

      // Invalidate any in-flight retry chain or toggle when `load` is replaced
      // (session switch) or on unmount, so stale work cannot setState: the
      // `busy` ownership token is dropped with it, and `aliveRef` silences a
      // `toggle` that is still awaiting its remote call.
      React.useEffect(() => {
        aliveRef.current = true;
        return () => {
          aliveRef.current = false;
          loadTokenRef.current += 1;
          busyTokenRef.current = 0;
          if (retryTimerRef.current !== null) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }
        };
      }, [load]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKeyDown);
        return () => { document.removeEventListener('keydown', onKeyDown); };
      }, [open]);

      if (!available) return null;

      // Per-server state, not an overall loading indicator: the trigger keeps
      // its pinwheel and shows how many enabled servers are connected. The
      // host's `loading` flag still drives the polling below, never the glyph.
      const enabledServers = snapshot === null ? [] : snapshot.servers.filter(server => server.enabled);
      const connectedCount = enabledServers.filter(server => server.mounted && !server.mountError).length;
      const allConnected = enabledServers.length > 0 && connectedCount === enabledServers.length;
      const count = snapshot === null ? undefined : snapshot.servers.length;
      const trigger = h('button', {
        type: 'button',
        className: 'dma-trigger',
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        onClick: () => { setOpen(!open); },
      }, h(Primitives.IconPluginPinwheelOutlineRegular, { size: 14 }),
        enabledServers.length > 0
          ? h('span', { className: 'dma-trigger-state' },
              h('span', {
                className: `dma-dot dma-dot-${allConnected ? 'ok' : 'pending'}`,
                'aria-hidden': 'true',
              }),
              `${t('connected')} ${connectedCount}/${enabledServers.length}`)
          : t('trigger'));

      let content;
      if (error !== null) {
        content = h('div', { className: 'dma-error' }, `${t('error')}: ${error}`);
      } else {
        // Rows carry their own state; there is no panel-wide loading row. A
        // partial list is the point: `loading` only means more is coming.
        const rows = [];
        if (snapshot !== null && snapshot.servers.length > 0) {
          rows.push(...snapshot.servers.map(server => ServerGroup(t, server, busy, toggle)));
        } else if (snapshot !== null) {
          // Either the manifest declares nothing, or discovery has not answered
          // yet. Without this row the body would be blank in both cases — and a
          // session with no live agent reports `loading` for as long as it lasts.
          rows.push(h('div', { key: 'empty', className: 'dma-note' },
            snapshot.loading ? t('connecting') : t('noServers')));
        }
        content = rows;
      }

      const panel = open
        ? ReactDom.createPortal(
            h('div', {
              ref: panelRef,
              'data-dsh-mcp-autoload': true,
              className: 'dma-panel',
              role: 'dialog',
              'aria-label': t('title'),
              style: position ?? { visibility: 'hidden', left: 0, top: 0 },
            },
              h('div', { className: 'dma-head' },
                h('span', { className: 'dma-head-title' }, t('title')),
                count === undefined ? null : h('span', { className: 'dma-head-count' }, String(count))),
              h('div', { className: 'dma-sub' },
                snapshot?.manifestPath
                  ? h('span', { className: 'dma-path', title: snapshot.manifestPath }, snapshot.manifestPath)
                  : h('span', { className: 'dma-path-none' }, t('manifest') + ': —'),
                h('button', {
                  type: 'button',
                  className: 'dma-refresh',
                  disabled: busy,
                  'aria-busy': busy,
                  onClick: () => { chainRef.current = 0; void load(); },
                }, busy ? LoadingSpinner(12) : null, t('refresh'))),
              h('div', { className: 'dma-rule' }),
              toggleError ? h('div', { className: 'dma-error' }, toggleError) : null,
              notice ? h('div', { className: 'dma-note' }, notice) : null,
              h('div', { className: 'dma-body' }, content)),
            document.body,
          )
        : null;

      return h('span', { ref: rootRef, 'data-dsh-mcp-autoload': true }, trigger, panel);
    }

    // ---- Browser plugin apply ----

    async function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, DICTS), 'mcp-autoload: dictionaries');
      ctx.effect(() => installStyles(), 'mcp-autoload: stylesheet');

      await ctx.remote.$mount(MCP_AUTOLOAD_REMOTE);

      ctx.inject(['remote.mcpAutoload'], (scope) => {
        const slots = scope.get('slots');
        const t = scope.locale.bind(NS);
        const remoteApi = scope.remote.mcpAutoload;
        slots.inject('conversation.composer.dock', () => slots.register({
          name: 'conversation.composer.dock',
          id: 'mcp-autoload',
          // Row start: the host's own pills are `activity` (order 0) and
          // `usage` (order 1), and the context meter renders after the whole
          // dock, so the right end is permanently taken. A negative order is
          // the only real edge.
          order: -50,
        }, (props) => McpAutoloadTrigger(props, t, remoteApi)));
      });
    }

    return { name, inject, apply };
  },
});
