import type { ComponentType, SVGProps } from "react";
import {
  ApiGateway, CloudFront, DynamoDb, Ec2, ElastiCache, ElasticContainerService, ElasticKubernetesService, ElasticLoadBalancing, Kinesis, Lambda, Rds, Route53, SimpleNotificationService, SimpleQueueService, SimpleStorageService, VirtualPrivateCloud,
} from "@likec4/icons/aws";
import {
  BigQuery, CloudFunctions, CloudLoadBalancing, CloudRun, CloudSql, CloudStorage, ComputeEngine, Firestore, GoogleKubernetesEngine, PubSub,
} from "@likec4/icons/gcp";
import {
  AppServices, AzureCosmosDb, AzureServiceBus, AzureSql, BlobBlock, EventHubs, FunctionApps, KubernetesServices, VirtualMachine,
} from "@likec4/icons/azure";
import type { DiagramPack, DiagramShapeDefinition } from "../../core/types";
import { COMMON_DIAGRAM_INSPECTOR_FIELDS, DEFAULT_DIAGRAM_PORTS } from "../../core/registry";
import { CloudPackRenderer, renderCloudShapeSvg } from "./CloudPackRenderer";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type Provider = "aws" | "gcp" | "azure";
const colors: Record<Provider, string> = { aws: "#ff9900", gcp: "#4285f4", azure: "#0078d4" };

function cloudShape(provider: Provider, id: string, label: string, IconComponent: Icon, keywords: readonly string[] = []): DiagramShapeDefinition {
  const color = colors[provider];
  return { id: `cloud.${provider}.${id}`, packId: "cloud", label, category: provider, keywords: [provider, label.toLowerCase(), id.replaceAll("-", " "), ...keywords], icon: `cloud.${provider}.${id}`, iconComponent: IconComponent, rendererId: "cloud.service", defaultSize: { width: 176, height: 76 }, minimumSize: { width: 126, height: 58 }, resize: { horizontal: true, vertical: true }, rotatable: true, ports: DEFAULT_DIAGRAM_PORTS, defaultStyle: { fill: "#18181b", stroke: color, strokeWidth: 1.25, opacity: 1, cornerRadius: 10 }, defaultTextStyle: { color: "#f4f4f5", fontSize: 12, fontWeight: "semibold", align: "left", verticalAlign: "middle", padding: 10 }, inspector: COMMON_DIAGRAM_INSPECTOR_FIELDS, data: { provider, serviceId: id, providerColor: color }, rendersOwnLabel: true, exportSvg: renderCloudShapeSvg };
}

export const CLOUD_PACK_SHAPES = [
  cloudShape("aws", "ec2", "EC2", Ec2, ["compute", "virtual machine"]), cloudShape("aws", "lambda", "Lambda", Lambda, ["serverless", "function"]), cloudShape("aws", "ecs", "ECS", ElasticContainerService, ["containers"]), cloudShape("aws", "eks", "EKS", ElasticKubernetesService, ["kubernetes"]), cloudShape("aws", "api-gateway", "API Gateway", ApiGateway), cloudShape("aws", "s3", "S3", SimpleStorageService, ["object storage"]), cloudShape("aws", "rds", "RDS", Rds, ["relational database"]), cloudShape("aws", "dynamodb", "DynamoDB", DynamoDb, ["nosql"]), cloudShape("aws", "elasticache", "ElastiCache", ElastiCache, ["redis", "cache"]), cloudShape("aws", "sqs", "SQS", SimpleQueueService, ["queue"]), cloudShape("aws", "sns", "SNS", SimpleNotificationService, ["pubsub", "notification"]), cloudShape("aws", "kinesis", "Kinesis", Kinesis, ["stream"]), cloudShape("aws", "cloudfront", "CloudFront", CloudFront, ["cdn"]), cloudShape("aws", "route53", "Route 53", Route53, ["dns"]), cloudShape("aws", "alb", "Application Load Balancer", ElasticLoadBalancing, ["alb", "load balancer"]), cloudShape("aws", "vpc", "VPC", VirtualPrivateCloud, ["network"]),
  cloudShape("gcp", "compute-engine", "Compute Engine", ComputeEngine), cloudShape("gcp", "cloud-run", "Cloud Run", CloudRun), cloudShape("gcp", "gke", "Google Kubernetes Engine", GoogleKubernetesEngine, ["gke", "kubernetes"]), cloudShape("gcp", "cloud-functions", "Cloud Functions", CloudFunctions), cloudShape("gcp", "cloud-storage", "Cloud Storage", CloudStorage), cloudShape("gcp", "cloud-sql", "Cloud SQL", CloudSql), cloudShape("gcp", "firestore", "Firestore", Firestore), cloudShape("gcp", "bigquery", "BigQuery", BigQuery), cloudShape("gcp", "pubsub", "Pub/Sub", PubSub), cloudShape("gcp", "load-balancing", "Cloud Load Balancing", CloudLoadBalancing),
  cloudShape("azure", "virtual-machines", "Virtual Machines", VirtualMachine), cloudShape("azure", "functions", "Functions", FunctionApps), cloudShape("azure", "aks", "AKS", KubernetesServices, ["kubernetes"]), cloudShape("azure", "app-service", "App Service", AppServices), cloudShape("azure", "blob-storage", "Blob Storage", BlobBlock), cloudShape("azure", "sql", "Azure SQL", AzureSql), cloudShape("azure", "cosmos-db", "Cosmos DB", AzureCosmosDb), cloudShape("azure", "service-bus", "Service Bus", AzureServiceBus), cloudShape("azure", "event-hubs", "Event Hubs", EventHubs),
] as const;

export const cloudDiagramPack: DiagramPack = {
  id: "cloud", label: "Cloud", description: "Curated official AWS, Google Cloud, and Microsoft Azure architecture icons.", icon: "cloud",
  categories: [{ id: "aws", label: "AWS", order: 0 }, { id: "gcp", label: "Google Cloud", order: 1 }, { id: "azure", label: "Microsoft Azure", order: 2 }],
  shapes: CLOUD_PACK_SHAPES,
  renderers: { "cloud.service": CloudPackRenderer },
};
