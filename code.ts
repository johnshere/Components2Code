function log(...args: any[]) {
  if (typeof args?.[0] === 'string') {
    args[0] = `[Components2Code] ${args[0]}`;
  }
  console.log.call(console, ...args);
}
// 显示UI界面
figma.showUI(__html__, {
  width: 360,
  height: 500,
  title: 'Components2Code',
});

// 监听选择变化
figma.on('selectionchange', () => {
  updateSelection();
});

// 监听UI消息
figma.ui.onmessage = (msg) => {
  switch (msg.type) {
    case 'init':
    case 'refresh':
      updateSelection();
      break;
    case 'generateJson':
      generateJson();
      break;
  }
};

// 更新选择信息
function updateSelection() {
  const selection = figma.currentPage.selection;

  // 简化节点信息用于UI显示
  const simplifiedSelection = selection.map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    locked: node.locked,
  }));

  figma.ui.postMessage({
    type: 'selectionUpdate',
    selection: simplifiedSelection,
  });
}

// 生成JSON数据
async function generateJson() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: 'error',
      error: '请先选择至少一个节点',
    });
    return;
  }

  try {
    // log('selection', selection);
    const jsonData = await nodeToJson(selection);
    // log('json data', jsonData);

    const componentData = filterComponentData(jsonData);

    figma.ui.postMessage({
      type: 'jsonResult',
      data: componentData.length === 1 ? componentData[0] : componentData,
    });
  } catch (error: any) {
    figma.ui.postMessage({
      type: 'error',
      error: `生成JSON失败: ${error.message}`,
    });
  }
}

// 过滤组件数据
function filterComponentData(jsonData: NodeData[]) {
  const componentData: NodeData[] = [];
  // 不是组件，在子元素中有是组件的，升级保留
  const upgradeComponentData: NodeData[] = [];
  const len = jsonData ? jsonData.length : 0;
  for (let i = 0; i < len; i++) {
    let node = jsonData[i];
    const children = filterComponentData(node.children || []);
    if (
      node.type === 'INSTANCE' ||
      node.type === 'COMPONENT' ||
      node.type === 'COMPONENT_SET'
    ) {
      node = { ...node, children };
      componentData.push(node);
    } else if (children.length > 0) {
      upgradeComponentData.push(...children);
    }
  }
  return [...componentData, ...upgradeComponentData];
}

interface NodeData {
  id: string;
  name: string;
  type: SceneNode['type'];
  visible: boolean;
  locked: boolean;
  description: string;
  componentId: string;
  children?: NodeData[];
}

// 将节点转换为JSON对象
async function nodeToJson(nodes: readonly SceneNode[]): Promise<NodeData[]> {
  const jsonData: NodeData[] = [];
  const len = nodes ? nodes.length : 0;
  for (let i = 0; i < len; i++) {
    const node = nodes[i];
    const children = await nodeToJson((node as any).children);
    const nodeData: NodeData = {
      id: node.id,
      name: node.name,
      type: node.type,
      visible: node.visible,
      locked: node.locked,
      description: '',
      componentId: '',
      children,
    };

    // 处理特定类型的节点
    switch (node.type) {
      case 'COMPONENT':
      case 'COMPONENT_SET':
      case 'INSTANCE':
        // 处理组件特有属性
        if (node.type === 'COMPONENT') {
          log('is component', node.name);
          const componentNode = node as ComponentNode;
          nodeData.description = componentNode.description;
        } else if (node.type === 'INSTANCE') {
          log('is instance', node.name);
          const componentNode = await node.getMainComponentAsync();
          const instanceNode = componentNode as any;
          nodeData.componentId = instanceNode?.componentId;
          nodeData.mainComponent = instanceNode.mainComponent
            ? {
                id: instanceNode.mainComponent.id,
                name: instanceNode.mainComponent.name,
              }
            : null;
        }
        jsonData.push(nodeData);
        break;
      default:
        // log('is default', node.name);
        // const shape = node as any
        // if (shape.children) {
        //   const children = await nodeToJson(shape.children);
        //   log('children', children);
        //   jsonData.push(...children)
        // }
        jsonData.push(nodeData);
        break;
    }
  }
  return jsonData;
}

// 初始化
updateSelection();
