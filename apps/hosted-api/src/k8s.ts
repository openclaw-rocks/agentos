/**
 * Kubernetes client for creating and managing OpenClawAgent CRDs.
 * Used during space provisioning to spin up agent pods.
 */

import * as k8s from "@kubernetes/client-node";

const CRD_GROUP = "openclaw.rocks";
const CRD_VERSION = "v1alpha1";
const CRD_PLURAL = "openclawagents";

/** Agent image configuration */
interface AgentImage {
  repository: string;
  tag: string;
}

/** Environment variable for an agent pod */
interface AgentEnvVar {
  name: string;
  value: string;
}

/** Parameters for creating an OpenClawAgent CRD */
export interface CreateAgentParams {
  /** Unique name for the CRD resource (must be DNS-compatible) */
  resourceName: string;
  /** Agent identifier (e.g. "assistant", "health-assistant") */
  agentName: string;
  /** Container image to run */
  image: AgentImage;
  /** Namespace to create in */
  namespace: string;
  /** Environment variables to inject */
  env?: AgentEnvVar[];
  /** Labels to apply */
  labels?: Record<string, string>;
}

/** Result of creating an OpenClawAgent CRD */
export interface CreateAgentResult {
  name: string;
  namespace: string;
  uid: string;
}

/**
 * Client for managing OpenClawAgent custom resources in Kubernetes.
 */
export class AgentCrdClient {
  private readonly client: k8s.CustomObjectsApi;
  private readonly defaultNamespace: string;

  constructor(namespace: string) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    this.client = kc.makeApiClient(k8s.CustomObjectsApi);
    this.defaultNamespace = namespace;
  }

  /**
   * Create an OpenClawAgent CRD instance to deploy an agent.
   */
  async createAgent(params: CreateAgentParams): Promise<CreateAgentResult> {
    const namespace = params.namespace || this.defaultNamespace;

    const body = {
      apiVersion: `${CRD_GROUP}/${CRD_VERSION}`,
      kind: "OpenClawAgent",
      metadata: {
        name: params.resourceName,
        namespace,
        labels: {
          "app.kubernetes.io/managed-by": "hosted-api",
          "openclaw.rocks/agent-name": params.agentName,
          ...params.labels,
        },
      },
      spec: {
        agentName: params.agentName,
        image: {
          repository: params.image.repository,
          tag: params.image.tag,
        },
        replicas: 1,
        env: params.env ?? [],
        resources: {
          requests: {
            cpu: "100m",
            memory: "128Mi",
          },
          limits: {
            cpu: "500m",
            memory: "512Mi",
          },
        },
        healthCheck: {
          enabled: true,
          path: "/health",
          port: 8080,
        },
      },
    };

    const response = await this.client.createNamespacedCustomObject({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace,
      plural: CRD_PLURAL,
      body,
    });

    const created = response as Record<string, unknown>;
    const metadata = created.metadata as Record<string, string> | undefined;

    return {
      name: metadata?.name ?? params.resourceName,
      namespace: metadata?.namespace ?? namespace,
      uid: metadata?.uid ?? "",
    };
  }

  /**
   * Delete an OpenClawAgent CRD instance.
   */
  async deleteAgent(resourceName: string, namespace?: string): Promise<void> {
    const ns = namespace ?? this.defaultNamespace;

    await this.client.deleteNamespacedCustomObject({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace: ns,
      plural: CRD_PLURAL,
      name: resourceName,
    });
  }

  /**
   * List all OpenClawAgent CRDs in a namespace.
   */
  async listAgents(
    namespace?: string,
    labelSelector?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const ns = namespace ?? this.defaultNamespace;

    const response = await this.client.listNamespacedCustomObject({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace: ns,
      plural: CRD_PLURAL,
      labelSelector,
    });

    const result = response as Record<string, unknown>;
    return (result.items as Array<Record<string, unknown>>) ?? [];
  }
}
