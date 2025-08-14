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
    log('selection', selection);
    const jsonData: any[] = [];
    for (const node of selection) {
      const nodeData = await nodeToJson(node);
      if (nodeData) {
        jsonData.push(nodeData);
      }
    }
    log('json data', jsonData);

    figma.ui.postMessage({
      type: 'jsonResult',
      data: jsonData.length === 1 ? jsonData[0] : jsonData,
    });
  } catch (error: any) {
    figma.ui.postMessage({
      type: 'error',
      error: `生成JSON失败: ${error.message}`,
    });
  }
}

interface NodeData {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  description: string;
  componentId: string;
  children: NodeData[];
}

// 将节点转换为JSON对象
async function nodeToJson(node: SceneNode): Promise<NodeData | null> {
  // log('node type', node.type);
  const children = [];
  for (const childNode of (node as any).children || []) {
    const childJson = await nodeToJson(childNode);
    if (childJson) {
      children.push(childJson);
    }
  }
  const nodeData = {
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
        log('is  component', node.name);
        const componentNode = node as ComponentNode;
        nodeData.description = componentNode.description;
      } else if (node.type === 'INSTANCE') {
        log('is  instance', node.name);
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

      return nodeData;
    default:
      return nodeData;
  }
}

// 初始化
updateSelection();
