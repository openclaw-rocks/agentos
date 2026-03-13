/**
 * Space provisioning routes.
 * When a user creates a space, this orchestrates:
 * 1. Creating the Matrix space + child rooms (channels)
 * 2. Setting OpenClaw state events (space config, agent roster)
 * 3. Creating OpenClawAgent CRDs for default agents
 */

import { builtInTemplates, EventTypes } from "@openclaw/protocol";
import type {
  SpaceAgentEntry,
  SpaceConfigEventContent,
  SpaceAgentsEventContent,
} from "@openclaw/protocol";
import { Router } from "express";
import { AgentCrdClient } from "../k8s.js";
import { MatrixApiError, MatrixClient } from "../matrix.js";

/** Default image registry for agent containers */
const AGENT_IMAGE_REGISTRY = process.env.AGENT_IMAGE_REGISTRY ?? "ghcr.io/openclawrocks";

interface CreateSpaceRequestBody {
  access_token: string;
  name: string;
  template_id: string;
  description?: string;
}

function isCreateSpaceBody(body: unknown): body is CreateSpaceRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.access_token === "string" &&
    typeof obj.name === "string" &&
    typeof obj.template_id === "string"
  );
}

/** Sanitize a name into a DNS-compatible resource name */
function toDnsName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

export function createSpacesRouter(matrix: MatrixClient, k8s: AgentCrdClient): Router {
  const router = Router();

  /**
   * POST /api/spaces
   * Create a fully provisioned space: Matrix rooms, state events, and agent CRDs.
   */
  router.post("/", async (req, res) => {
    if (!isCreateSpaceBody(req.body)) {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "access_token, name, and template_id are required",
      });
      return;
    }

    const { access_token, name, template_id, description } = req.body;

    // Look up the template
    const template = builtInTemplates.find((t) => t.id === template_id);
    if (!template) {
      res.status(400).json({
        error: "INVALID_TEMPLATE",
        message: `Unknown template: ${template_id}`,
      });
      return;
    }

    try {
      // 1. Create the Matrix space
      const space = await matrix.createSpace(
        access_token,
        name,
        description ?? template.description,
      );

      console.log(`[spaces] created space ${space.room_id} with template ${template_id}`);

      // 2. Set the space config state event
      const spaceConfig: SpaceConfigEventContent = {
        template_id: template.id,
        template_name: template.name,
        icon: template.icon,
        description: description ?? template.description,
        layout_mode: template.layout_mode,
      };

      await matrix.sendStateEvent(
        access_token,
        space.room_id,
        EventTypes.SpaceConfig,
        "",
        spaceConfig as unknown as Record<string, unknown>,
      );

      // 3. Create child rooms (channels)
      const channels = template.suggested_channels ?? ["general"];
      const channelIds: string[] = [];

      for (const channelName of channels) {
        const channel = await matrix.createChannel(access_token, space.room_id, channelName);
        channelIds.push(channel.room_id);
        console.log(`[spaces] created channel ${channelName} (${channel.room_id})`);
      }

      // 4. Build agent roster and create CRDs
      const agentEntries: SpaceAgentEntry[] = [];
      const createdCrds: Array<{ name: string; agentName: string }> = [];
      const spaceDnsName = toDnsName(name);

      for (const agentDef of template.default_agents) {
        // Add to roster
        const entry: SpaceAgentEntry = {
          ...agentDef,
          active: true,
        };
        agentEntries.push(entry);

        // Create CRD for the agent
        const resourceName = `${spaceDnsName}-${toDnsName(agentDef.id)}`;
        try {
          const crd = await k8s.createAgent({
            resourceName,
            agentName: agentDef.id,
            image: {
              repository: `${AGENT_IMAGE_REGISTRY}/agent-${agentDef.id}`,
              tag: "latest",
            },
            namespace: process.env.K8S_NAMESPACE ?? "agentos",
            env: [
              { name: "SPACE_ID", value: space.room_id },
              { name: "AGENT_ID", value: agentDef.id },
            ],
            labels: {
              "openclaw.rocks/space-id": spaceDnsName,
              "openclaw.rocks/template": template_id,
            },
          });

          createdCrds.push({ name: crd.name, agentName: agentDef.id });
          console.log(`[spaces] created agent CRD ${crd.name} for ${agentDef.id}`);
        } catch (crdErr: unknown) {
          // Log but don't fail the whole request — the space is still usable
          console.error(`[spaces] failed to create CRD for agent ${agentDef.id}:`, crdErr);
        }
      }

      // 5. Set the agent roster state event
      const agentsContent: SpaceAgentsEventContent = {
        agents: agentEntries,
      };

      await matrix.sendStateEvent(
        access_token,
        space.room_id,
        EventTypes.SpaceAgents,
        "",
        agentsContent as unknown as Record<string, unknown>,
      );

      res.status(201).json({
        space_id: space.room_id,
        channels: channelIds,
        agents: createdCrds,
        template: {
          id: template.id,
          name: template.name,
        },
      });
    } catch (err: unknown) {
      if (err instanceof MatrixApiError) {
        console.error(
          `[spaces] Matrix error during provisioning: ${err.errcode} ${err.matrixMessage}`,
        );
        res.status(err.statusCode >= 400 ? err.statusCode : 502).json({
          error: err.errcode,
          message: err.matrixMessage,
        });
        return;
      }

      console.error("[spaces] unexpected error during provisioning:", err);
      res.status(500).json({
        error: "PROVISIONING_FAILED",
        message: "Failed to provision space. Some resources may have been partially created.",
      });
    }
  });

  return router;
}
