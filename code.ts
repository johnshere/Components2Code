const Config = {
  Prefix: 'U',
};

function log(...args: any[]) {
  // console.log.call(console, `[Components2Code]`, ...args);
}
// 显示UI界面
figma.showUI(__html__, {
  width: 500,
  height: 600,
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
    case 'generateData':
      generateData(msg);
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

let prefix = Config.Prefix;
// 生成JSON数据
async function generateData(msg: { prefix: string }) {
  prefix = msg.prefix || Config.Prefix;
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
    const html = componentDataToHtml(componentData);

    figma.ui.postMessage({
      type: 'dataResult',
      data: html,
    });
  } catch (error: any) {
    figma.ui.postMessage({
      type: 'error',
      error: `生成JSON失败: ${error.message}`,
    });
  }
}
// 将字符串转换为帕斯卡命名（PascalCase）
function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ') // 将特殊字符替换为空格
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

// 格式化组件属性值为HTML属性字符串
function formatProperties(
  properties?: ComponentProperties,
  variantProperties?: Record<string, string>
) {
  const props = {} as Record<string, string | boolean>;
  properties = properties || {};
  Object.keys(properties).map((key) => {
    const value = properties[key].value;
    key = String(key).split('#').shift()!;
    props[key] = value;
  });
  variantProperties = variantProperties || {};
  Object.keys(variantProperties).forEach((key) => {
    const value = variantProperties[key];
    key = String(key).split('#').shift()!;
    props[key] = value;
  });
  return Object.keys(props)
    .map((key) => {
      const value = props[key];
      const isBool = typeof value === 'boolean';
      if (isBool && value === false) return '';
      if (
        !isBool &&
        (value === 'default' ||
          value === 'off' ||
          value === 'basic' ||
          value === 'none')
      )
        return '';
      return `${isBool ? ':' : ''}${key}="${value}"`;
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * 1. 组件数据转换为HTML字符串
 * 2. 处理嵌套
 * 3. 处理组件属性
 * 4. 处理缩进，每下钻一层，缩进增加2个空格
 * @param data
 * @param indent 缩进空格数
 * @returns
 */
function componentDataToHtml(data: NodeData[], indent = 0) {
  let html = '';
  data.forEach((item, i) => {
    const name = toPascalCase(item.name);
    const isStartsWithPrefix = name
      .toLowerCase()
      .startsWith(prefix.toLowerCase());
    const tag = isStartsWithPrefix ? name : prefix + name;

    const props = formatProperties(
      item.componentProperties,
      item.variantProperties
    );

    if (i) html += `\n`;
    html += `${' '.repeat(indent)}<${tag}`;
    if (props) {
      html += ` ${props}`;
    }

    if (item.children?.length) {
      html += `>\n`;
      html += componentDataToHtml(item.children, indent + 2);
      html += `\n${' '.repeat(indent)}`;
      html += `</${tag}>`;
    } else {
      html += ` />`;
    }
  });
  return html;
}

// 过滤组件数据
function filterComponentData(jsonData: NodeData[]) {
  const componentData: NodeData[] = [];
  // 不是组件，在子元素中有是组件的，升级保留
  const upgradeComponentData: NodeData[] = [];
  const len = jsonData ? jsonData.length : 0;
  for (let i = 0; i < len; i++) {
    let node = jsonData[i];
    if (!node.visible) {
      continue;
    }
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
  locked?: boolean;
  description?: string;
  componentPropertyDefinitions?: any;
  mainComponent?: {
    id: string;
    name: string;
  };
  componentProperties?: ComponentProperties;
  variantProperties?: { [key: string]: string };
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
      children,
    };

    // 处理特定类型的节点
    switch (node.type) {
      case 'COMPONENT':
      case 'COMPONENT_SET':
      case 'INSTANCE':
        // 处理组件特有属性
        if (node.type === 'COMPONENT') {
          log(node.name, 'is', node.type);
          const componentNode = node as ComponentNode;
          nodeData.description = componentNode.description;
          // 获取组件属性定义
          if (componentNode.componentPropertyDefinitions) {
            nodeData.componentPropertyDefinitions =
              componentNode.componentPropertyDefinitions;
          }
        } else if (node.type === 'INSTANCE') {
          log(node.name, 'is', node.type);
          const instanceNode = node as InstanceNode;
          // 获取主组件信息
          const mainComponent = await instanceNode.getMainComponentAsync();
          if (mainComponent) {
            nodeData.mainComponent = {
              id: mainComponent.id,
              name: mainComponent.name,
            };
          }
          // 获取属性
          if (instanceNode.componentProperties) {
            nodeData.componentProperties = instanceNode.componentProperties;
          }
        } else if (node.type === 'COMPONENT_SET') {
          log(node.name, 'is', node.type);
          const componentSetNode = node as ComponentSetNode;
          // 获取组件集属性定义
          if (componentSetNode.componentPropertyDefinitions) {
            nodeData.componentPropertyDefinitions =
              componentSetNode.componentPropertyDefinitions;
          }
          // 获取变体属性
          if (componentSetNode.variantProperties) {
            nodeData.variantProperties = componentSetNode.variantProperties;
          }
          // 获取属性
          if (componentSetNode.componentProperties) {
            nodeData.componentProperties = componentSetNode.componentProperties;
          }
        }
        log(node.name, 'data', nodeData);
        jsonData.push(nodeData);
        break;
      default:
        // log(node.name, 'is', node.type);
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
