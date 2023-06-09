#!/bin/bash

### daemonset suppose to synchronize imagecontentsourcepolicy and global pull secert to workers in 1 minute
# The daemonset runs on every worker node, converting on fly
#   imagecontentsourcepolicy to worker file /etc/containers/registries.conf
#   global pull secert to worker file /.docker/config.json
#   version (icsp and global pull secret) to worker file /version
### to improve: rbac

# export IBMCLOUD_APIKEY=${IBMCLOUD_APIKEY}
# if [ -z "$IBMCLOUD_APIKEY" ]; then
#   echo "!!! ibmcloud api key is required to enable"
#   exit
# fi

# [ -n "$JQ" ] || JQ=$(which jq)
# if [ -z "$JQ" ]; then
#   echo "!!! jq is required to configure"
#   exit
# fi

# export IBMCLOUD_CLUSTER=${IBMCLOUD_CLUSTER}
# export IBMCLOUD_REGION=${IBMCLOUD_REGION}
# if [ -z "$IBMCLOUD_REGION" ]; then
#   export IBMCLOUD_REGION=$($OC get nodes -o jsonpath="{.items[*].metadata.labels}" | jq | grep "ibm-cloud.kubernetes.io.region" | sort -u | sed -e 's/"//g' -e 's/,//g' | awk '{print $NF}')
#   if [ $(echo $IBMCLOUD_REGION | wc -l) -gt 2 ]; then
#     echo "!!! your worker pool seems to span in multiple regions, provide IBMCLOUD_REGION for your master pool"
#     exit
#   fi
# fi
# if [ -z "$IBMCLOUD_CLUSTER" ]; then
#   export IBMCLOUD_CLUSTER=$($OC get nodes -o jsonpath="{.items[*].metadata.labels}" | jq | grep "ibm-cloud.kubernetes.io.worker-pool-id" | sort -u | sed -e 's/"//g' | awk '{print $NF}'  | sed -e 's/-.*//')
# fi
# if [ -z "$IBMCLOUD_REGION" -o -z "$IBMCLOUD_CLUSTER" ]; then
#   echo "!!! you are likely using classic roks, provide region and cluster with IBMCLOUD_REGION and IBMCLOUD_CLUSTER please"
#   exit
# fi

[ -n "$OC" ] || OC=$(which oc)
if ! $OC get nodes 2>/dev/null; then
  echo "!!! configure your cluster access to enable"
  exit
fi

$OC -n kube-system delete svc svc-roks-icsp 2>/dev/null
$OC -n kube-system delete ds roks-icsp-ds 2>/dev/null

ACTION=${1:-create}
$OC $ACTION -f- << ENDF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sa-roks-sync
  namespace: kube-system
ENDF
sleep 3
$OC adm policy add-cluster-role-to-user cluster-admin system:serviceaccount:kube-system:sa-roks-sync

$OC $ACTION -f- << ENDF
apiVersion: apps/v1
kind: DaemonSet
metadata:
  labels:
    app: roks-icsp
  name: roks-icsp-ds
  namespace: kube-system
spec:
  selector:
    matchLabels:
      app: roks-icsp
  template:
    metadata:
      labels:
        app: roks-icsp
    spec:
      containers:
      - image: quay.io/cicdtest/roks-enabler
        imagePullPolicy: Always
        name: roks-icsp
        priorityClassName: openshift-user-critical
        env: []
        volumeMounts:
        - name: host
          mountPath: /host
        securityContext:
          privileged: true
          runAsUser: 0
        resources: {}
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
      serviceAccountName: sa-roks-sync
      volumes:
      - name: host
        hostPath:
          path: /
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext: {}
      terminationGracePeriodSeconds: 5
      nodeSelector:
        node-role.kubernetes.io/worker: ""
---
apiVersion: v1
kind: Service
metadata:
  labels:
    app: roks-icsp
  name: svc-roks-icsp
  namespace: kube-system
spec:
  ports:
  - port: 80
    protocol: TCP
    targetPort: 3000
  selector:
    app: roks-icsp
  sessionAffinity: None
  type: ClusterIP
ENDF

