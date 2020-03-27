import connect from "../../../../renderer/screens/helpers/connect";
import React, { Component } from "react";
import jsonTheme from "../../../../common/utils/jsonTheme";
import ReactJson from "@ganache/react-json-view";
import NodeLink from "../components/NodeLink";
import { Link } from "react-router-dom";
import TransactionData from "../transaction-data";
import { CancellationToken } from "./utils";
import { setToast } from "../../../../common/redux/network/actions";
// import { basename } from "path"

// this is taken from braid
// const VERSION_REGEX = /^(.*?)(?:-(?:(?:\d|\.)+))\.jar?$/;

const IGNORE_FIELDS = new Set(["@class", "participants"]);

function getCleanState(state) {
  const data = state.state.data;
  const cleanState = {};
  for (const key in data) {
    if (IGNORE_FIELDS.has(key)) continue;
    cleanState[key] = data[key];
  }
  return cleanState;
}

class Transaction extends Component {
  refresher = new CancellationToken();

  constructor(props) {
    super(props);

    this.state = {selectedIndex: null, transaction: null, attachments: null, inputs: null, commands: null, cordapps: null};
  }

  componentWillUnmount() {
    this.refresher.cancel();
  }

  componentDidMount(){
    this.refresh();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.config.updated !== this.props.config.updated) {
      // if the data has updated let's refresh the transaction just in case
      // things have changed.
      this.refresh();
    } else if (prevProps.match.params.txhash !== this.props.match.params.txhash) {
      // if the txhash has changed we first want to trigger the loading screen
      // by getting rid of the current `transaction` then we need to refresh our data
      this.setState({selectedIndex: null, transaction: null, attachments: null, inputs: null, commands: null, cordapps: null}, this.refresh.bind(this));
    }
  }

  async downloadAttachment(attachment) {
    const result = await TransactionData.downloadAttachment(attachment.filename, attachment.attachment_id, attachment.database);
    this.props.dispatch(setToast(result));
  }

  async refresh() {
    this.refresher.cancel();

    let canceller = this.refresher.getCanceller();
    
    const port = this.props.config.settings.workspace.postgresPort;
    const nodes = this.props.config.settings.workspace.nodes;
    const txhash = this.props.match.params.txhash;

    const transaction = new TransactionData(txhash);
    const updaterProm = transaction.update(nodes, port, canceller).then(() => {
      if (canceller.cancelled) return;
      this.setState({transaction});
    });
    transaction.fetchDetails(nodes, port, false, canceller).then(async details => {
      if (canceller.cancelled) return;
      // we don't want to render attachments before the transaction is rendered...
      await updaterProm;
      if (canceller.cancelled) return;
      
      this.setState({attachments: details.attachments, commands: details.commands});
      
      // allow the tabs to render what we do know while we fetch the remaining details
      // from the other nodes
      this.setState({inputs: new Map(
        details.inputs.map((inState, index) => [index, {ref: {
          txhash: TransactionData.convertTransactionIdToHash(inState.txhash),
          index: inState.index
        }}])
      )});

      const statePromises = details.inputs.map(async (inState, index) => {
        const transaction = new TransactionData(TransactionData.convertTransactionIdToHash(inState.txhash));
        // TODO: this gets too much data... we only care about the single index,
        // not all of them. Also, we may be able to batch the requests by transaction
        // as multiple output states from a single previous transaction can be used
        // as input states for the next transaction
        await transaction.update(nodes, port, canceller);
        if (canceller.cancelled) return;
        const txStates = transaction.states;
        return [index, txStates.get(inState.index)];
      });
      Promise.all(statePromises).then(results => {
        const inputs = new Map(results);
        this.setState({inputs});
      })

      // const workspace = this.props.config.settings.workspace;
      // const projects = workspace.projects;
      // const braidNames = new Map();


      // TODO:
      // Compute the SHA256 hash of each `project` in `workspace.projects`
      // query ssh for run nodeDiagnosticInfo
      //   * get the "jarHash" for each Contract
      // query postgres for public.node_attachments_contracts by "jarHash" from above
      //   * get the `contract_class_name` value
      // Truncate each command in `details.command` at the first "$", then match
      //   the value against the `contract_class_name` from above.
      // Use the mapping from "jarHash" -> command -> "contract_class_name" to find
      //   the the matching project hash in `workspace.projects`
      // You've found the originating contract involved in this TX!
      // EZPZ.




      // const txFlows = details.commands.map(command => command.value["@class"].replace(/\$/g, "_"));
      // projects.filter(project => project != undefined).forEach(cordapp => {
      //   braidNames.set(VERSION_REGEX.exec(basename(cordapp))[1], cordapp);
      // });
      // const allNodes = [...workspace.nodes, ...workspace.notaries];
      // Promise.all(allNodes.map(node => {
      //   return fetch(`https://localhost:${node.braidPort}/api/rest/cordapps`).then(r => r.json())
      //     .then(array => {
      //       if (Array.isArray(array)) return {node, array};
      //       return {node, array :[]};
      //     });
      // })).then(results => {
      //   const uniqueCordapps = new Map();
      //   results.forEach(r =>{
      //     r.array
      //       .filter(value => braidNames.has(value))
      //       .forEach(value => {
      //         uniqueCordapps.set(value, r.node);
      //       });
      //   });
      //   const cordappPromises = [];
      //   uniqueCordapps.forEach((node, cordapp) => {
      //     // TODO: replace with parsing swagger.json
      //     // we need to look for the "command" in the `components.schemas` of
      //     // this JSON
      //     const req = fetch(`https://localhost:${node.braidPort}/swagger.json`)
      //       .then(r => r.json())
      //       .then(swagger => {
      //           if (swagger && swagger.components && Array.isArray(swagger.components.schemas)){
      //             return {cordapp, schemas: swagger.components.schemas};
      //           } else {
      //             return {cordapp, schemas: []};
      //           }
      //         })
      //     // const req = fetch(`https://localhost:${node.braidPort}/api/rest/cordapps/${cordapp}/flows`).then(r => r.json())
      //     //   .then(array => {
      //     //     if (Array.isArray(array)) return {cordapp, array};
      //     //     return {cordapp, array: []};
      //     //   });
      //     cordappPromises.push(req);
      //   });
      //   return Promise.all(cordappPromises);
      // })
      // .then(schemases => {
      //   const uniques = new Set();
      //   schemases.forEach(({cordapp, schemas}) => {

      //     let txFlow;
      //     do {
      //       txFlow = txFlows.pop();
      //     } while(txFlow);
      //   }).map(({cordapp}) => {
      //     return braidNames.get(cordapp);
      //   }));
      // }).then(cordapps => {
      //   this.setState({cordapps});
      // })
        
      // }).then(cordappsInfos => {
      //   return new Set(cordappsInfos.filter(({array}) => {
      //     console.log(txFlows, array);
      //     return txFlows.some(flow => array.includes(flow));
      //   }).map(({cordapp}) => {
      //     return braidNames.get(cordapp);
      //   }));
      // }).then(cordapps => {
      //   this.setState({cordapps});
      // })
    });
  }

  renderStateHeader(state, type) {
    const index = state.ref.index;
    const txhash = state.ref.txhash;
    const txData = getCleanState(state);
    const meta = state.metaData;
    return (
      <div className="corda-details-section corda-transaction-details">
        <h3 className="Label">
          State {index} ({meta.status}) @ {meta.recordedTime}
          <div className="Label-rightAligned corda-transaction-classname">{state.state.contract}</div>
          {type === "Output" ? "" :
            <div className="corda-transaction-details-tx-link"><em>TX&nbsp;
              <Link style={{textTransform: "none"}} to={"/corda/transactions/" + txhash}>{txhash}</Link>
            </em></div>
          }
        </h3>
        
        <div className="Nodes DataRows corda-json-view">
          <ReactJson
            src={
              txData
            }
            name={false}
            theme={jsonTheme}
            iconStyle="triangle"
            edit={false}
            add={false}
            delete={false}
            enableClipboard={true}
            displayDataTypes={true}
            displayObjectSize={true}
            indentWidth={4}// indent by 4 because that's what Corda likes to do.
            collapsed={1}
            collapseStringsAfterLength={36}
          />
        </div>
      </div>
    );
  }

  render() {
    const transaction = this.state.transaction;
    if (!transaction) {
      return (<div className="Waiting Waiting-Padded">Loading Transaction...</div>);
    }

    const txStates = transaction.states;
    if (txStates.size === 0) {
      return (<div className="Waiting Waiting-Padded">Couldn&apos;t locate transaction {this.props.match.params.txhash}</div>);
    }

    const tabs = [];
    let selectedIndex = this.state.selectedIndex;
    let selectedState;
    [["Output", txStates], ["Input", this.state.inputs]].forEach(([type, states]) => {
      if (states === null) {
        tabs.push(<div key={"tab_button_" + type + "_loading"} style={{order: 9999999, cursor: "wait"}} ref={"tab_button_" + type + "_loading"} className="corda-tab Label">Loading {type} States...</div>);
        return;
      }
      for (let [index, state] of states) {
        const key = state.ref.txhash + state.ref.index;
        if (selectedIndex === null) {
          selectedIndex = key;
        }
        const order = (type==="Input" ? 1000 : 0) + index;
        tabs.push(<div key={"tab_button_" + key} style={{order}} ref={"tab_button_" + key} onClick={this.setState.bind(this, {selectedIndex: key}, undefined)} className={(selectedIndex === key ? "corda-tab-selected" : "") + " corda-tab Label"}>{type} State {index + 1}</div>);
        if (selectedIndex !== key) continue;
        if (!state.state) {
          selectedState = (<div className="Waiting Waiting-Padded">Loading State...</div>);
          continue;
        }

        const participants = state.state.data.participants || [];
        const workspaceNotary = this.getWorkspaceNotary(state.state.notary.owningKey);

        selectedState = (<div>
          {this.renderStateHeader(state, type)}
          
          {state.state.data.exitKeys && state.state.data.exitKeys.length !== 0 ? (
            <div className="corda-details-section">
              <h3 className="Label">Signers</h3>
              <div className="DataRows">
                {state.state.data.exitKeys.map(nodeKey => {
                  const workspaceNode = this.getWorkspaceNode(nodeKey);
                  if (workspaceNode) {
                    return (<NodeLink key={"participant_" + workspaceNode.safeName} postgresPort={this.props.config.settings.workspace.postgresPort} node={workspaceNode} />);
                  }
                })}
              </div>
            </div>
          ) : ("")}
          {!workspaceNotary ? "" :
            <div className="corda-details-section">
              <h3 className="Label">Notary</h3>
              <div className="DataRows">{<NodeLink node={workspaceNotary} postgresPort={this.props.config.settings.workspace.postgresPort} />}</div>
            </div>
          }

          {!participants.length ? "" :
          <div className="corda-details-section">
            <h3 className="Label">Participants</h3>
            <div className="DataRows">
              {participants.map((node, i) => {
                const workspaceNode = this.getWorkspaceNode(node.owningKey);
                if (workspaceNode) {
                  return (<NodeLink key={"participant_" + workspaceNode.safeName} postgresPort={this.props.config.settings.workspace.postgresPort} node={workspaceNode} />);
                } else {
                  return (<div className="DataRow" key={"participant_anon" + node.owningKey + i}><div className="Value"><em>Anonymized Participant</em></div></div>);
                }
              })}
            </div>
          </div>}

          {!state.observers.size ? "" :
            <div className="corda-details-section">
              <h3 className="Label">In Vault Of</h3>
              <div className="DataRows">
                {[...state.observers].map(node => {
                  return (<NodeLink key={"participant_" + node.safeName} postgresPort={this.props.config.settings.workspace.postgresPort} node={node} />);
                })}
              </div>
            </div>}
          </div>
        );
      }
    });

    let commands = null;
    if (this.state.commands === null){
      commands = (<div>Loading...</div>);
    } else if (this.state.commands.length === 0) {
      commands = (<div>No commands</div>);
    } else {
      commands = this.state.commands.map((command, i) => {
        return (<div style={{marginBottom:".5em"}} key={"command" + command.value["@class"] + i}>{command.value["@class"].split(".").map(d=>(<>{d}<div style={{display:"inline-block"}}>.</div></>))}</div>);
      });
    }

    let attachments = null;
    if (this.state.attachments === null){
      attachments = (<div>Loading...</div>);
    } else if (this.state.attachments.length === 0) {
      attachments = (<div>No attachments</div>);
    } else {
      attachments = this.state.attachments.map(attachment => {
        return (<div style={{marginBottom:".5em", cursor:"pointer"}} onClick={()=>{this.downloadAttachment(attachment)}} key={attachment.attachment_id}>{attachment.filename}</div>);
      });
    }

    return (
      <section className="BlockCard" style={{minHeight:"100%"}}>
        <header>
          <button className="Button" onClick={this.props.history.goBack}>
            &larr; Back
          </button>
          <h1 className="Title">
          TX {transaction.txhash}
          </h1>
        </header>
        <main className="corda-details-container">
          <div className="DataRow corda-details-section corda-transaction-details-info">
            <div>
              <h3 className="Label">Commands</h3>
              <div>
                {commands}
              </div>
            </div>
            <div>
              <h3 className="Label">Attachments</h3>
              <div>
                {attachments}
              </div>
            </div>
          </div>
          <div className="DataRow corda-details-section corda-transaction-details-info">
            <div>
              <h3 className="Label">Timestamp</h3>
              <div>{transaction.earliestRecordedTime.toString()}</div>
            </div>
          </div>
          <div className="DataRow corda-details-section corda-transaction-details-info">
            <div>
              <h3 className="Label">Cordapps</h3>
              <div>{
                !this.state.cordapps ? "" :
                  [...this.state.cordapps].map(cordapp => {
                    return <div key={cordapp}>{cordapp}</div>
                  })
              }</div>
            </div>
          </div>

          <div className="corda-tabs">
            {tabs}
          </div>
          {selectedState}
        </main>
      </section>
    );
  }
  getWorkspaceNodeByType(type, owningKey) {
    return this.props.config.settings.workspace[type].find(node => owningKey === node.owningKey);
  }
  getWorkspaceNode(owningKey) {
    return this.getWorkspaceNodeByType("nodes", owningKey);
  }
  getWorkspaceNotary(owningKey) {
    return this.getWorkspaceNodeByType("notaries", owningKey);
  }
}

export default connect(
  Transaction,
  "config"
);
