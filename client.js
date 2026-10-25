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
        servers: { type: 'array', items: MCP_SERVER_VIEW_JSON },
      },
      required: ['sessionId', 'manifestPath', 'servers'],
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
          Object.freeze({ name: 'confirmed', wire: 'confirmed', source: 'json', description: 'Explicit user confirmation for changing the project manifest.', codec: strictCodec('dsh-mcp-autoload/types#Confirmed', { type: 'boolean' }) }),
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
        loading: 'Loading…',
        error: 'Failed to load MCP inventory',
        originProject: 'Project-level (from .agents/mcp.json)',
        originUser: 'User-level (profile configuration)',
        enabled: 'Enabled',
        disabled: 'Disabled',
        retry: 'Retry',
        enabledState: 'Enabled',
        disabledState: 'Disabled',
        enable: 'Enable',
        disable: 'Disable',
        confirmEnable: 'Enable this project MCP server? The project JSON file will be rewritten.',
        confirmDisable: 'Disable this project MCP server? Its tools will be removed from this session and the project JSON file will be rewritten.',
        toggleFailed: 'Failed to change MCP server',
        toggleDone: 'MCP server updated. Backup: ',
        mountFailed: 'Connection failed',
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
        loading: '加载中…',
        error: '加载 MCP 清单失败',
        originProject: '项目级（来自 .agents/mcp.json）',
        originUser: '用户级（profile 配置）',
        enabled: '已启用',
        disabled: '已禁用',
        retry: '重试连接',
        enabledState: '已启用',
        disabledState: '已禁用',
        enable: '启用',
        disable: '禁用',
        confirmEnable: '确定启用此项目级 MCP？将同步修改项目 JSON 文件。',
        confirmDisable: '确定禁用此项目级 MCP？它的工具会从当前会话移除，并同步修改项目 JSON 文件。',
        toggleFailed: '修改 MCP 状态失败',
        toggleDone: '已更新 MCP。备份：',
        mountFailed: '连接失败',
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
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}
[data-dsh-mcp-autoload] .dma-server-error {
  margin-top: 2px;
  color: var(--dsw-alias-state-error-primary);
  overflow-wrap: anywhere;
}
[data-dsh-mcp-autoload] .dma-server-count {
  flex: none;
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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

    function ServerGroup(t, server, busy, onToggle) {
      const isProject = server.origin === 'project';
      const retrying = server.enabled && !server.mounted;
      const label = retrying ? t('retry') : server.enabled ? t('disable') : t('enable');
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
            : h('span', { className: 'dma-server-count' },
                `${server.toolCount} ${server.toolCount === 1 ? t('tool') : t('tools')}`)),
        isProject
          ? h('div', { className: 'dma-server-state' }, server.enabled ? t('enabledState') : t('disabledState'))
          : null,
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
        if (showBusy) setBusy(true);
        try {
          const result = await remoteApi.status(sessionId);
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
          setSnapshot(result.value);
          setError(null);
        } catch (cause) {
          setError(String(cause?.message ?? cause));
        } finally {
          if (showBusy) setBusy(false);
        }
      }, [sessionId, remoteApi]);

      const toggle = React.useCallback(async (server) => {
        if (server.origin !== 'project' || !server.rawName || sessionId === undefined || busy) return;
        const retrying = server.enabled && !server.mounted;
        const message = retrying ? null : server.enabled ? t('confirmDisable') : t('confirmEnable');
        if (message !== null && !window.confirm(`${message}\n\n${server.rawName || server.serverName}`)) return;
        const enabled = retrying || !server.enabled;
        setBusy(true);
        setToggleError(null);
        setNotice(null);
        try {
          const result = await remoteApi.setEnabled(sessionId, server.rawName, enabled, true);
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
          setNotice(result.value.backupPath ? `${t('toggleDone')} ${result.value.backupPath}` : t(enabled ? 'enabled' : 'disabled'));
          await load(false);
        } catch (cause) {
          setToggleError(`${t('toggleFailed')}: ${String(cause?.message ?? cause)}`);
        } finally {
          setBusy(false);
        }
      }, [sessionId, busy, remoteApi, load, t]);

      // Load once per session so the trigger can show the count before opening.
      React.useEffect(() => { void load(); }, [load]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKeyDown);
        return () => { document.removeEventListener('keydown', onKeyDown); };
      }, [open]);

      if (!available) return null;

      const count = snapshot === null ? undefined : snapshot.servers.length;
      const trigger = h('button', {
        type: 'button',
        className: 'dma-trigger',
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        onClick: () => { setOpen(!open); },
      }, count === undefined ? t('trigger') : `${t('trigger')} · ${count}`);

      let content;
      if (error !== null) {
        content = h('div', { className: 'dma-error' }, `${t('error')}: ${error}`);
      } else if (snapshot === null) {
        content = h('div', { className: 'dma-note' }, t('loading'));
      } else if (snapshot.servers.length === 0) {
        content = h('div', { className: 'dma-note' }, t('noServers'));
      } else {
        content = snapshot.servers.map(server => ServerGroup(t, server, busy, toggle));
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
                  onClick: () => void load(),
                }, t('refresh'))),
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
          order: -100,
        }, (props) => McpAutoloadTrigger(props, t, remoteApi)));
      });
    }

    return { name, inject, apply };
  },
});
