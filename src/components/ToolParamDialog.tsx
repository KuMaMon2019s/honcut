// src/components/ToolParamDialog.tsx — MCP 工具动态参数对话框
// 根据后端 inputSchema (JSON Schema) 动态渲染表单
// 自动填充 project_id / item_id 等上下文参数

import { useState, useMemo, useCallback } from "react";
import { api } from "../api/client";
import type { ToolInfo } from "../mcp/tools";

interface ToolParamDialogProps {
  tool: ToolInfo;
  projectId: string;
  clipId?: string | null;
  onClose: () => void;
  onResult?: (success: boolean, message: string) => void;
}

// 长文本字段 → textarea
const LONG_TEXT_FIELDS = new Set([
  "script", "prompt", "description", "props", "colors", "fonts",
]);

interface SchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

export default function ToolParamDialog({
  tool, projectId, clipId, onClose, onResult,
}: ToolParamDialogProps) {
  const schema = tool.inputSchema as {
    properties?: Record<string, SchemaProperty>;
    required?: string[];
  };
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const propNames = Object.keys(properties);

  // 自动填充上下文参数
  const autoFilled = useMemo(() => {
    const filled: Record<string, string> = {};
    if (propNames.includes("project_id")) filled.project_id = projectId;
    if (propNames.includes("item_id") && clipId) filled.item_id = clipId;
    if (propNames.includes("clip_id") && clipId) filled.clip_id = clipId;
    return filled;
  }, [propNames, projectId, clipId]);

  // 表单值
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = { ...autoFilled };
    for (const name of propNames) {
      if (init[name] !== undefined) continue;
      const prop = properties[name];
      if (prop.default !== undefined) {
        init[name] = typeof prop.default === "object"
          ? JSON.stringify(prop.default)
          : String(prop.default);
      } else {
        init[name] = "";
      }
    }
    return init;
  });

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; text: string } | null>(null);

  const setValue = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);

  // 验证必填字段（自动填充的不算缺）
  const missingRequired = propNames.filter(
    name => required.has(name) && !autoFilled[name] && !values[name]?.trim()
  );

  const handleSubmit = async () => {
    if (missingRequired.length > 0 || submitting) return;
    setSubmitting(true);
    setResult(null);

    // 构建参数：过滤空值，按 schema 类型转换
    const args: Record<string, unknown> = {};
    for (const name of propNames) {
      const raw = values[name];
      if (raw === undefined || raw === "") continue;
      const prop = properties[name];
      if (prop.type === "number") {
        const n = Number(raw);
        if (!isNaN(n)) args[name] = n;
      } else if (prop.type === "boolean") {
        args[name] = raw === "true" || raw === "1";
      } else if (prop.type === "object") {
        try { args[name] = JSON.parse(raw); } catch { args[name] = raw; }
      } else {
        args[name] = raw;
      }
    }

    try {
      const res = await api.mcpCall(tool.name, args);
      const result = res.result as {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      } | undefined;
      const text = result?.content?.[0]?.text ?? JSON.stringify(res.result);
      const isError = result?.isError ?? false;
      setResult({ success: !isError, text });
      onResult?.(!isError, text);
    } catch (e) {
      const msg = (e as Error).message;
      setResult({ success: false, text: msg });
      onResult?.(false, msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── 样式 ──
  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 4000,
    background: "rgba(0,0,0,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const dialogStyle: React.CSSProperties = {
    background: "#1e1e1e", border: "1px solid #333", borderRadius: 10,
    width: 460, maxHeight: "80vh", overflow: "auto",
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: "#999", marginBottom: 3, display: "block",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "6px 8px", fontSize: 12,
    background: "#2a2a2a", border: "1px solid #444", borderRadius: 4,
    color: "#e0e0e0", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={dialogStyle}>
        {/* 头部 */}
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #333" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>{tool.meta.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>
                {tool.meta.label}
                <span style={{ fontSize: 11, color: "#666", marginLeft: 8, fontWeight: 400 }}>
                  {tool.name}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                {tool.description}
              </div>
            </div>
            {tool.meta.dangerous && (
              <span style={{
                fontSize: 9, color: "#ef4444", border: "1px solid #ef4444",
                borderRadius: 3, padding: "1px 5px", flexShrink: 0,
              }}>
                危险操作
              </span>
            )}
          </div>
        </div>

        {/* 表单 */}
        <div style={{ padding: "12px 16px" }}>
          {propNames.length === 0 && (
            <div style={{ fontSize: 12, color: "#888", padding: "8px 0" }}>
              此工具无需参数，直接执行即可。
            </div>
          )}
          {propNames.map(name => {
            const prop = properties[name];
            const isAutoFilled = autoFilled[name] !== undefined;
            const isRequired = required.has(name) && !isAutoFilled;
            const isLongText = LONG_TEXT_FIELDS.has(name) || prop.type === "object";
            const isEnum = prop.enum && prop.enum.length > 0;
            const isBool = prop.type === "boolean";

            return (
              <div key={name} style={{ marginBottom: 10 }}>
                <label style={labelStyle}>
                  {name}
                  {isRequired && <span style={{ color: "#ef4444" }}> *</span>}
                  {isAutoFilled && (
                    <span style={{ color: "#4ade80", marginLeft: 6 }}>（自动填充）</span>
                  )}
                  {prop.description && (
                    <span style={{ color: "#666", marginLeft: 6 }}>— {prop.description}</span>
                  )}
                </label>

                {isAutoFilled ? (
                  <input
                    style={{ ...inputStyle, opacity: 0.5, cursor: "default" }}
                    value={autoFilled[name]}
                    readOnly
                  />
                ) : isEnum ? (
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={values[name] ?? ""}
                    onChange={e => setValue(name, e.target.value)}
                  >
                    <option value="">— 选择 —</option>
                    {prop.enum!.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                ) : isBool ? (
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={values[name] ?? ""}
                    onChange={e => setValue(name, e.target.value)}
                  >
                    <option value="">— 选择 —</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : isLongText ? (
                  <textarea
                    style={{
                      ...inputStyle, minHeight: 60, resize: "vertical",
                      fontFamily: prop.type === "object" ? "monospace" : "inherit",
                    }}
                    value={values[name] ?? ""}
                    onChange={e => setValue(name, e.target.value)}
                    placeholder={prop.type === "object" ? '{"key": "value"}' : ""}
                  />
                ) : (
                  <input
                    style={inputStyle}
                    type={prop.type === "number" ? "number" : "text"}
                    value={values[name] ?? ""}
                    onChange={e => setValue(name, e.target.value)}
                    placeholder={prop.description ?? ""}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 执行结果 */}
        {result && (
          <div style={{
            margin: "0 16px 10px", padding: "8px 10px", borderRadius: 6,
            fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap",
            wordBreak: "break-all", maxHeight: 150, overflow: "auto",
            background: result.success ? "#0a2a0a" : "#2a0a0a",
            border: `1px solid ${result.success ? "#166534" : "#991b1b"}`,
            color: result.success ? "#4ade80" : "#f87171",
          }}>
            {result.text}
          </div>
        )}

        {/* 底部按钮 */}
        <div style={{
          padding: "10px 16px 14px", borderTop: "1px solid #333",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px", fontSize: 12, borderRadius: 6,
              background: "transparent", border: "1px solid #555",
              color: "#aaa", cursor: "pointer",
            }}
          >
            关闭
          </button>
          <button
            onClick={handleSubmit}
            disabled={missingRequired.length > 0 || submitting}
            style={{
              padding: "6px 18px", fontSize: 12, borderRadius: 6, fontWeight: 600,
              background: missingRequired.length > 0 || submitting ? "#333" : "#3b82f6",
              border: "none",
              color: missingRequired.length > 0 || submitting ? "#666" : "#fff",
              cursor: missingRequired.length > 0 || submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "执行中…" : "▶ 执行"}
          </button>
        </div>
      </div>
    </div>
  );
}
