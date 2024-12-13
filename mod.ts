import { useEffect, useState } from "react";

type Kind = "Pod" | "Service" | "Deployment" | "StatefulSet" | "DaemonSet" | "ConfigMap" | "Secret" | "Ingress" | "ServiceAccount" | "Role" | "RoleBinding" | "ClusterRole" | "ClusterRoleBinding" | "PersistentVolumeClaim" | "PersistentVolume" | "StorageClass" | "CustomResourceDefinition"

interface KubernetesResource {
  metadata: {
    uid: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface WatchEvent {
  type: 'ADDED' | 'MODIFIED' | 'DELETED';
  object: KubernetesResource;
}

async function* watchResources(hostAndPort: string, apiVersion: string, kind: Kind, namespace: string, name?: string): AsyncGenerator<WatchEvent> {
  const response = await fetch([
    hostAndPort,
    `/api/${apiVersion}/watch/namespaces/${namespace}/${kind.toLowerCase()}s`,
    name ? `/${name}` : ''
  ].filter(Boolean).join(""));

  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim().length > 0) {
        try {
          const event = JSON.parse(line) as WatchEvent;
          yield event;
        } catch (error) {
          console.error('Error parsing JSON:', error);
        }
      }
    }
  }
}

function useResourcesWatcher<T extends KubernetesResource>(
  apiVersion: string, 
  kind: Kind, 
  namespace: string, 
  name?: string
): T[] | T | null {
  const [resources, setResources] = useState<T[] | T | null>(name ? null : []);

  useEffect(() => {
    let isSubscribed = true;

    async function watchAndUpdate() {
      try {
        // TODO: Cluster context will give provider host and certificates
        for await (const event of watchResources("localhost:8001", apiVersion, kind, namespace, name)) {
          if (!isSubscribed) break;

          setResources((current: T[] | T | null) => {
            switch (event.type) {
              case 'ADDED':
                if (name) {
                  return event.object as T;
                }
                return Array.isArray(current) 
                  ? [...current, event.object as T] 
                  : [event.object as T];
 
              case 'MODIFIED':
                if (name) {
                  return (current as T | null)?.metadata.uid === event.object.metadata.uid 
                    ? event.object as T 
                    : current;
                }
                return Array.isArray(current) 
                  ? current.map((item: T) => 
                      item.metadata.uid === event.object.metadata.uid 
                        ? event.object as T 
                        : item
                    )
                  : current;

              case 'DELETED':
                if (name) {
                  return null;
                }
                return Array.isArray(current) 
                  ? current.filter((item: T) => 
                      item.metadata.uid !== event.object.metadata.uid
                    )
                  : current;
 
              default:
                return current;
            }
          });
        }
      } catch (error) {
        console.error('Watch error:', error);
      }
    }

    watchAndUpdate();
    return () => { isSubscribed = false; };
  }, name 
    ? [apiVersion, kind, namespace, name] 
    : [apiVersion, kind, namespace]
  );

  return resources;
}

export function useResources<T extends KubernetesResource>(
  apiVersion: string, 
  kind: Kind, 
  namespace: string
): T[] {
  return useResourcesWatcher<T>(apiVersion, kind, namespace) as T[];
}

export function useResource<T extends KubernetesResource>(
  apiVersion: string, 
  kind: Kind, 
  namespace: string, 
  name: string
): T | null {
  return useResourcesWatcher<T>(apiVersion, kind, namespace, name) as T | null;
}
