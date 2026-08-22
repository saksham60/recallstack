# Canvas component architecture

Recall Stack has two related canvas surfaces. The reusable diagram studio lives
under `src/features/diagram`; the system-design practice editor lives under
`src/features/system-design`. Both use React 19, Next.js, Konva, and
React-Konva. They do not use a second drag-and-drop package: Konva handles
canvas pointer dragging while the HTML palette uses the native drag-and-drop
API.

## System-design editor data flow

- `SystemDesignWorkspace` owns a reducer state. Mutations are typed actions;
  document mutations enter bounded undo history while selection and transient
  editor state do not.
- `SystemDesignCanvas` converts client coordinates to world coordinates using
  the persisted viewport before a palette drop. Konva node coordinates are
  already world coordinates. Drag previews update Konva nodes and connected
  edges imperatively, then commit one reducer mutation at drag end.
- Every node has a stable ID, semantic type, world position, size, layer,
  visibility and lock state. Optional style, typography, asset, technology,
  hierarchy and string metadata remain serializable.
- Palette definitions form the node registry: they provide category, label,
  icon, tooltip and default size. The visual registry supplies semantic canvas
  appearance. Specialized render paths are selected from those registry
  semantics rather than from problem content.
- Documents are validated and schema-migrated before the local-storage
  repository restores them. Autosave is debounced, while drag and resize each
  generate a single document commit. JSON, SVG, Draw.io, PDF and interactive
  HTML export paths consume the same document.
- Clipboard fragments clone selected nodes, internal edges and nested module
  diagrams. Paste allocates fresh node, edge and diagram IDs. Keyboard handlers
  ignore inputs, textareas, selects, contenteditable elements and ARIA
  textboxes, so Backspace/Delete and canvas shortcuts cannot consume text-edit
  keystrokes.

## Draggable component inventory

The generic studio registry contains the following additional pack-owned
shapes. They share the generic `DiagramShape` lifecycle (drag, resize according
to the definition, inspector editing, persistence, fresh-ID copy/paste and SVG /
Draw.io export).

| Studio pack | Registered shapes |
| --- | --- |
| General | rectangle, rounded rectangle, circle, ellipse, diamond, triangle, hexagon, cylinder, document, cloud, person, text, note, frame, container |
| Flowchart | start/end, process, decision, input/output, document, database, manual input, preparation, connector, annotation |
| ERD | entity/table with structured fields |
| System design | registry-backed technology component |
| Cloud | registry-derived AWS, Google Cloud and Microsoft Azure icon components |

All registered node types are draggable, resizable, editable in the inspector,
persisted, copyable and included by the document export paths unless locked or
the editor is in preview mode. Image content is editable through its asset;
connectors are selectable/editable/persisted/copyable/exported but are not
free-dragging or independently resizable.

| Family | Registered types |
| --- | --- |
| Clients | `user`, `web_app`, `mobile_app`, `admin_portal` |
| Networking | `dns`, `cdn`, `load_balancer`, `api_gateway` |
| Compute | `service`, `microservice`, `monolith`, `worker`, `serverless_function` |
| Data | `sql_database`, `nosql_database`, `cache`, `search_engine`, `object_storage`, `data_warehouse` |
| Messaging | `message_queue`, `event_stream`, `pubsub` |
| External | `third_party_api`, `payment_provider`, `notification_provider`, `email_provider`, `sms_provider`, `identity_provider` |
| Modules | `module`, `logical_module`, `feature_module`, `domain_module` |
| Boundaries | `system_boundary`, `module_boundary`, `vpc_boundary`, `region_boundary`, `availability_zone_boundary`, `kubernetes_cluster_boundary`, `deployment_group_boundary`, `swimlane_boundary`, `container` |
| Annotations | `text`, `note`, `warning_note`, `assumption_note`, `rectangle`, `rounded_rectangle`, `ellipse`, `diamond`, `callout`, `divider`, `label`, `image` |
| Connections | All `SystemDesignEdgeType` variants; port-anchored rather than free-dragging |

## Extension rules

1. Add a semantic node type and one palette definition. Add specialized Konva
   rendering only when existing registry chrome cannot express it.
2. Keep learning-problem content in `SystemDesignProblem`; do not add brief
   fields to the canvas engine. Rich briefs may supply a problem statement,
   requirements, concepts, follow-up questions, difficulty, category, tags and
   notes. Completion remains document state.
3. Treat tags as open content. Rendering normalizes arbitrary values; it never
   branches on known tag names.
4. Keep large learning content in the scrollable problem panel. Canvas nodes
   use bounded dimensions and clipped/ellipsized text, with full editing in the
   inspector, so long content cannot expand the world unexpectedly.
5. Any new persisted field must be cloned, validated, migrated if necessary,
   copied, exported and covered by reducer/repository tests.

## Deferred improvements

- Rotation is not represented by the current document model. Add it only with
  a concrete diagramming requirement and update all export formats together.
- Multi-selection already supports move, duplicate, delete, grouping and
  layering; multi-node resize is intentionally not supported.
- For substantially larger documents, profile before adding virtualization.
  Current dragging avoids reducer writes per frame, but normal React commits
  still render the visible node collection.
