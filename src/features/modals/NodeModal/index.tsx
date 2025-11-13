import React, { useEffect, useState } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, TextInput, Group } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import { parser } from "../../editor/views/GraphView/lib/jsonParser";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const [editMode, setEditMode] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  useEffect(() => {
    // populate form values when node changes
    if (!nodeData) {
      setFormValues({});
      setEditMode(false);
      return;
    }

    const initial: Record<string, string> = {};
    nodeData.text?.forEach(row => {
      if (row.key && row.type !== "array" && row.type !== "object") {
        initial[row.key] = row.value != null ? String(row.value) : "";
      }
    });
    setFormValues(initial);
  }, [nodeData]);

  const setValueAtPath = (root: any, path: NodeData["path"] | undefined) => {
    if (!path || path.length === 0) return root;
    let cur: any = root;
    for (const seg of path) {
      if (cur == null) return undefined;
      cur = cur[seg as any];
    }
    return cur;
  };

  const coerceValue = (value: string, type?: string) => {
    if (type === "number") {
      const n = Number(value);
      return Number.isNaN(n) ? value : n;
    }
    if (type === "boolean") {
      if (value === "true") return true;
      if (value === "false") return false;
    }
    if (value === "null") return null;
    return value;
  };

  const handleSave = () => {
    try {
      const raw = useJson.getState().json;
      const parsed = raw ? JSON.parse(raw) : {};
      const parent = setValueAtPath(parsed, nodeData?.path);
      if (parent == null || typeof parent !== "object") {
        // fallback: root
        console.warn("Could not find parent for path, applying to root");
      }

      Object.keys(formValues).forEach(key => {
        const row = nodeData?.text.find(r => r.key === key);
        const newVal = coerceValue(formValues[key], row?.type as any);
        if (parent && typeof parent === "object") parent[key] = newVal;
        else parsed[key] = newVal;
      });

  const jsonStr = JSON.stringify(parsed, null, 2);
  useJson.getState().setJson(jsonStr);
  // update the left-side editor contents as well (avoid triggering another json->graph update)
  useFile.getState().setContents({ contents: jsonStr, hasChanges: false, skipUpdate: true });
      // re-parse graph and update selected node so modal content reflects changes
      try {
        const graph = parser(jsonStr);
        const matched = graph.nodes.find(n => JSON.stringify(n.path) === JSON.stringify(nodeData?.path));
        if (matched) {
          useGraph.getState().setSelectedNode(matched);
        }
      } catch (e) {
        // ignore parser errors here — we've already updated the global json
      }

      // stay in modal, just exit edit mode and show updated content
      setEditMode(false);
    } catch (err) {
      // parsing failed — keep modal open and log
      // Could add user-facing notification here
      // eslint-disable-next-line no-console
      console.error("Failed to save node edits", err);
    }
  };

  const handleCancel = () => {
    // revert form values to original
    const initial: Record<string, string> = {};
    nodeData?.text.forEach(row => {
      if (row.key && row.type !== "array" && row.type !== "object") {
        initial[row.key] = row.value != null ? String(row.value) : "";
      }
    });
    setFormValues(initial);
    setEditMode(false);
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group>
              {editMode ? (
                <>
                  <Button color="green" size="xs" onClick={handleSave}>
                    Save
                  </Button>
                  <Button color="red" size="xs" onClick={handleCancel}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button size="xs" onClick={() => setEditMode(true)}>
                    Edit
                  </Button>
                  <CloseButton onClick={onClose} />
                </>
              )}
            </Group>
          </Flex>
          {editMode ? (
            <Stack gap="xs">
              <Text fz="xs" fw={500}>
                Edit Values
              </Text>
              <Stack>
                {nodeData?.text
                  .filter(row => row.key && row.type !== "array" && row.type !== "object")
                  .map(row => (
                    <TextInput
                      key={row.key ?? ""}
                      label={row.key ?? ""}
                      value={formValues[row.key ?? ""] ?? ""}
                      onChange={e => setFormValues(prev => ({ ...prev, [row.key ?? ""]: e.currentTarget.value }))}
                    />
                  ))}
              </Stack>
            </Stack>
          ) : (
            <ScrollArea.Autosize mah={250} maw={600}>
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            </ScrollArea.Autosize>
          )}
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
