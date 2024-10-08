***

title: Deploy
weight: -20
geekdocNav: true
geekdocAlign: center
geekdocAnchor: false
--------------------

### Example - 1: Deploy a standalone test network (version `0.42.5`)

Initialize `solo` with tag `v0.42.5` and list of node names `node0,node1,node2`

```
$ solo init -t v0.42.5 -i node0,node1,node2 -n "${SOLO_NAMESPACE}" -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --key-format pfx

```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Setup home directory and cache
✔ Check dependency: helm [OS: linux, Release: 5.15.0-1061-gke, Arch: x64]
✔ Check dependencies
✔ Setup chart manager

***************************************************************************************
Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: /home/runner/.solo
If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.
***************************************************************************************
✔ Copy templates in '/home/runner/.solo/cache'

```

Generate `pfx` formatted node keys

We need to generate `pfx` keys as `pem` key files are only supported by Hedera platform >=`0.47.0-alpha.0`.

```
$ solo node keys --gossip-keys --tls-keys --key-format pfx

```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Initialize
✔ Check keytool exists (Version: 21.0.1+12)
✔ Backup old files
✔ Generate private-node0.pfx for node: node0
✔ Generate private-node1.pfx for node: node1
✔ Generate private-node2.pfx for node: node2
✔ Generate public.pfx file
✔ Clean up temp files
✔ Generate gossip keys
✔ Backup old files
✔ TLS key for node: node2
✔ TLS key for node: node1
✔ TLS key for node: node0
✔ Generate gRPC TLS keys
✔ Finalize

```

Key files are generated in `~/.solo/keys` directory.

```
$ ls ~/.solo/cache/keys

hedera-node0.crt  hedera-node1.crt  hedera-node2.crt  private-node0.pfx private-node2.pfx
hedera-node0.key  hedera-node1.key  hedera-node2.key  private-node1.pfx public.pfx
```

Setup cluster with shared components.\
In a separate terminal, you may run `k9s` to view the pod status.

```
$ solo cluster setup
```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Initialize
✔ Prepare chart values
✔ Install 'fullstack-cluster-setup' chart

```

Deploy helm chart with Hedera network components\
It may take a while (5~15 minutes depending on your internet speed) to download various docker images and get the pods started.\
If it fails, ensure you have enough resources allocated for Docker engine and retry the command.

```
$ solo network deploy

```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Initialize
✔ Install chart 'fullstack-deployment'
✔ Check Node: node0
✔ Check Node: node1
✔ Check Node: node2
✔ Check node pods are running
✔ Check Envoy Proxy for: node0
✔ Check Envoy Proxy for: node2
✔ Check Envoy Proxy for: node1
✔ Check HAProxy for: node0
✔ Check HAProxy for: node1
✔ Check HAProxy for: node2
✔ Check proxy pods are running
✔ Check MinIO
✔ Check auxiliary pods are ready

```

Setup node with Hedera platform software.\
It may take a while as it download the hedera platform code from <https://builds.hedera.com/>

```
$ solo node setup

```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Initialize
✔ Check network pod: node0
✔ Check network pod: node1
✔ Check network pod: node2
✔ Identify network pods
✔ Copy configuration files
✔ Copy Gossip keys to staging
✔ Copy gRPC TLS keys to staging
✔ Prepare config.txt for the network
✔ Prepare staging directory
✔ Update node: node0
✔ Update node: node1
✔ Update node: node2
✔ Fetch platform software into network nodes
✔ Copy Gossip keys
✔ Copy Gossip keys
✔ Copy Gossip keys
✔ Copy TLS keys
✔ Copy TLS keys
✔ Copy TLS keys
✔ Copy configuration files
✔ Copy configuration files
✔ Copy configuration files
✔ Set file permissions
✔ Node: node2
✔ Set file permissions
✔ Node: node0
✔ Set file permissions
✔ Node: node1
✔ Setup network nodes
✔ Finalize

```

Start the nodes.

```
$ solo node start

```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Initialize
✔ Check network pod: node0
✔ Check network pod: node2
✔ Check network pod: node1
✔ Identify network pods
✔ Start node: node1
✔ Start node: node0
✔ Start node: node2
✔ Starting nodes
✔ Check node: node0
✔ Check node: node1
✔ Check node: node2
✔ Check nodes are ACTIVE
✔ Check proxy for node: node0
✔ Check proxy for node: node2
✔ Check proxy for node: node1
✔ Check node proxies are ACTIVE

```

Deploy mirror node

```
$ solo mirror-node deploy

```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Initialize
✔ Prepare address book
✔ Deploy mirror-node
✔ Enable mirror-node
✔ Check Hedera Explorer
✔ Check Postgres DB
✔ Check GRPC
✔ Check Monitor
✔ Check REST API
✔ Check Importer
✔ Check pods are ready

```

Deploy a JSON RPC relay

```
$ solo relay deploy

```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Initialize
✔ Prepare chart values
✔ Deploy JSON RPC Relay
✔ Check relay is ready

```

You may view the list of pods using `k9s` as below:

```
 Context: kind-solo-e2e                            <0> all       <a>      Attach     <l>     … ____  __.________
 Cluster: kind-solo-e2e                            <1> default   <ctrl-d> Delete     <p>      |    |/ _/   __   \______
 User:    kind-solo-e2e                                          <d>      Describe   <shift-f>|      < \____    /  ___/
 K9s Rev: v0.27.4 ⚡️v0.32.4                                      <e>      Edit       <s>      |    |  \   /    /\___ \
 K8s Rev: v1.27.3                                                <?>      Help       <n>      |____|__ \ /____//____  >
 CPU:     n/a                                                    <ctrl-k> Kill       <f>              \/            \/
 MEM:     n/a
┌─────────────────────────────────────────────────── Pods(all)[27] ────────────────────────────────────────────────────┐
│ NAMESPACE↑          NAME                                                   PF READY RESTARTS STATUS   IP             │
│ fullstack-setup     console-557956d575-fqctd                               ●  1/1          0 Running  10.244.0.4     │
│ fullstack-setup     minio-operator-7d575c5f84-j9p6f                        ●  1/1          0 Running  10.244.0.3     │
│ kube-system         coredns-5d78c9869d-gknqp                               ●  1/1          0 Running  10.244.0.6     │
│ kube-system         coredns-5d78c9869d-q59pc                               ●  1/1          0 Running  10.244.0.5     │
│ kube-system         etcd-solo-e2e-control-plane                            ●  1/1          0 Running  172.18.0.2     │
│ kube-system         kindnet-w9ps5                                          ●  1/1          0 Running  172.18.0.2     │
│ kube-system         kube-apiserver-solo-e2e-control-plane                  ●  1/1          0 Running  172.18.0.2     │
│ kube-system         kube-controller-manager-solo-e2e-control-plane         ●  1/1          0 Running  172.18.0.2     │
│ kube-system         kube-proxy-p69z8                                       ●  1/1          0 Running  172.18.0.2     │
│ kube-system         kube-scheduler-solo-e2e-control-plane                  ●  1/1          0 Running  172.18.0.2     │
│ local-path-storage  local-path-provisioner-6bc4bddd6b-8pkfk                ●  1/1          0 Running  10.244.0.2     │
│ solo                envoy-proxy-node0-84947f844f-f28tp                     ●  1/1          0 Running  10.244.0.215   │
│ solo                envoy-proxy-node1-65f8879dcc-j2lrk                     ●  1/1          0 Running  10.244.0.216   │
│ solo                envoy-proxy-node2-667f848689-dkmf9                     ●  1/1          0 Running  10.244.0.214   │
│ solo                fullstack-deployment-grpc-69f9cc5666-lf6ql             ●  1/1          0 Running  10.244.0.227   │
│ solo                fullstack-deployment-hedera-explorer-79f79b7df4-wjdct  ●  1/1          0 Running  10.244.0.226   │
│ solo                fullstack-deployment-importer-864489ffb8-6v8tk         ●  1/1          0 Running  10.244.0.228   │
│ solo                fullstack-deployment-postgres-postgresql-0             ●  1/1          0 Running  10.244.0.232   │
│ solo                fullstack-deployment-rest-584f5cb6bb-q9vnt             ●  1/1          0 Running  10.244.0.230   │
│ solo                fullstack-deployment-web3-69dcdfc4fb-mm5pk             ●  1/1          0 Running  10.244.0.229   │
│ solo                haproxy-node0-6969f76c77-n5cfl                         ●  1/1          1 Running  10.244.0.219   │
│ solo                haproxy-node1-59f6976d45-x6xmp                         ●  1/1          1 Running  10.244.0.217   │
│ solo                haproxy-node2-6df64d5457-hf9ps                         ●  1/1          1 Running  10.244.0.218   │
│ solo                minio-pool-1-0                                         ●  2/2          1 Running  10.244.0.224   │
│ solo                network-node0-0                                        ●  5/5          0 Running  10.244.0.221   │
│ solo                network-node1-0                                        ●  5/5          0 Running  10.244.0.222   │
│ solo                network-node2-0                                        ●  5/5          0 Running  10.244.0.220   │

```

#### Access Hedera Network services

Once the nodes are up, you may now expose various services (using `k9s` (shift-f) or `kubectl port-forward`) and access. Below are most used services that you may expose.

Node services: `network-<node ID>-svc`\
HAProxy: `haproxy-<node ID>-svc`\
Envoy Proxy: `envoy-proxy-<node ID>-svc`\
Hedera explorer: `fullstack-deployment-hedera-explorer`\
JSON Rpc Relays\
You can deploy JSON RPC relays for one or more nodes as below:

```
$ solo relay deploy -i node0,node1

```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Initialize
✔ Prepare chart values
✔ Deploy JSON RPC Relay
✔ Check relay is ready

```

### Example - 2: Deploy a standalone test network (version `0.47.0-alpha.0`)

Initialize `solo` with tag `v0.47.0-alpha.0` and list of node names `node0,node1,node2`:

```
# reset .solo directory
$ rm -rf ~/.solo

$ solo init -t v0.47.0-alpha.0 -i node0,node1,node2 -n "${SOLO_NAMESPACE}" -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --key-format pem

```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Setup home directory and cache
✔ Check dependency: helm [OS: linux, Release: 5.15.0-1061-gke, Arch: x64]
✔ Check dependencies
✔ Setup chart manager

***************************************************************************************
Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: /home/runner/.solo
If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.
***************************************************************************************
✔ Copy templates in '/home/runner/.solo/cache'

```

Generate `pem` formatted node keys

```
$ solo node keys --gossip-keys --tls-keys --key-format pem

```

Example output

```

******************************* Solo *********************************************
Version			: 0.27.0
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
✔ Initialize
✔ Backup old files
✔ Gossip pem key for node: node0
✔ Gossip pem key for node: node1
✔ Gossip pem key for node: node2
✔ Generate gossip keys
✔ Backup old files
✔ TLS key for node: node0
✔ TLS key for node: node1
✔ TLS key for node: node2
✔ Generate gRPC TLS keys
✔ Finalize

```

PEM key files are generated in `~/.solo/keys` directory.

```
$ ls ~/.solo/cache/keys
a-private-node0.pem a-public-node1.pem  hedera-node1.crt    s-private-node0.pem s-public-node1.pem
a-private-node1.pem a-public-node2.pem  hedera-node1.key    s-private-node1.pem s-public-node2.pem
a-private-node2.pem hedera-node0.crt    hedera-node2.crt    s-private-node2.pem
a-public-node0.pem  hedera-node0.key    hedera-node2.key    s-public-node0.pem

```

Setup cluster with shared components

```
$ solo cluster setup

# output is similar to example-1

```

In a separate terminal, you may run `k9s` to view the pod status.

Deploy helm chart with Hedera network components

```
$ solo network deploy

# output is similar to example-1

```

Setup node with Hedera platform.\
It may take a while (~10 minutes depending on your internet speed) to download various docker images and get the
pods started.

```
$ solo node setup

# output is similar to example-1

```

Start the nodes

```
$ solo node start

# output is similar to example-1

```

### For Developers Working on Hedera Service Repo

First, pleaes clone hedera service repo `https://github.com/hashgraph/hedera-services/` and build the code
with `./gradlew assemble`. If need to running nodes with different versions or releases, please duplicate the repo or build directories in
multiple directories, checkout to the respective version and build the code.

To set customized `settings.txt` file, edit the file
`~/.solo/cache/templates/settings.txt` after `solo init` command.

Then you can start customized built hedera network with the following command:

```
solo node setup --local-build-path <default path to hedera repo>,node1=<custom build hedera repo>,node2=<custom build repo>

```

### For Developers Working on Platform core

To deploy node with local build PTT jar files, run the following command:

```
solo node setup --local-build-path <default path to hedera repo>,node1=<custom build hedera repo>,node2=<custom build repo>
 --app PlatformTestingTool.jar --app-config <path-to-test-json1,path-to-test-json2>

```

### Logs

You can find log for running solo command under the directory `~/.solo/logs/`
The file `solo.log` contains the logs for the solo command.
The file `hashgraph-sdk.log` contains the logs from solo client when sending transactions to network nodes.
