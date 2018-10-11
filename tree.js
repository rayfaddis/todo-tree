/* jshint esversion:6 */

var vscode = require( 'vscode' );
var path = require( "path" );

var utils = require( './utils.js' );
var icons = require( './icons.js' );
var config = require( './config.js' );

var workspaceFolders;
var nodes = [];

const PATH = "path";
const TODO = "todo";

var buildCounter = 1;

var isVisible = function( e )
{
    return e.visible === true;
};

function createWorkspaceRootNode( folder )
{
    return {
        isRootTag: true,
        type: PATH,
        label: folder.name,
        nodes: [],
        fsPath: folder.uri.fsPath,
        id: ( buildCounter * 1000000 ) + utils.hash( folder.uri.fsPath ),
        visible: true
    };
}

function createPathNode( folder, pathElements )
{
    var fsPath = pathElements.length > 0 ? path.join( folder, pathElements.join( path.sep ) ) : folder;
    return {
        type: PATH,
        fsPath: fsPath,
        pathElement: pathElements[ pathElements.length - 1 ],
        label: pathElements[ pathElements.length - 1 ],
        nodes: [],
        id: ( buildCounter * 1000000 ) + utils.hash( fsPath ),
        visible: true
    };
}

function createFlatNode( fsPath, rootNode )
{
    var pathLabel = path.dirname( rootNode === undefined ? fsPath : path.relative( rootNode.fsPath, fsPath ) );

    return {
        type: PATH,
        fsPath: fsPath,
        label: path.basename( fsPath ),
        pathLabel: pathLabel === '.' ? '' : '(' + pathLabel + ')',
        // path: relativePath,
        nodes: [],
        todos: [],
        id: ( buildCounter * 1000000 ) + utils.hash( fsPath ),
        visible: true
    };
}

function createTodoNode( result )
{
    var label = result.match.substr( result.column - 1 );
    label = utils.removeBlockComments( label, result.file );

    return {
        type: TODO,
        fsPath: result.file,
        label: label,
        line: result.line - 1,
        id: ( buildCounter * 1000000 ) + utils.hash( JSON.stringify( result.match ) ),
        visible: true
    };
}

class TreeNodeProvider
{
    constructor( _context )
    {
        this._context = _context;

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    getChildren( node )
    {
        if( node === undefined )
        {
            var rootNodes = nodes.filter( isVisible );
            if( rootNodes.length > 0 )
            {
                if( config.shouldGroup() )
                {
                    rootNodes.sort( function( a, b )
                    {
                        return a.name > b.name;
                    } );
                }
                return rootNodes;
            }
            return [ { label: "Nothing found", empty: true } ];
        }
        else if( node.type === PATH )
        {
            if( node.nodes && node.nodes.length > 0 )
            {
                return node.nodes.filter( isVisible );
            }
            else
            {
                return node.todos.filter( isVisible );
            }
        }
        else if( node.type === TODO )
        {
            return node.text;
        }
    }

    getParent( node )
    {
        return node.parent;
    }

    getTreeItem( node )
    {
        let treeItem = new vscode.TreeItem( node.label + ( node.pathLabel ? ( " " + node.pathLabel ) : "" ) );

        treeItem.id = node.id;

        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;

        if( node.fsPath )
        {
            treeItem.resourceUri = new vscode.Uri.file( node.fsPath );
            treeItem.tooltip = node.fsPath;

            if( node.type === PATH )
            {
                treeItem.collapsibleState = config.shouldExpand() ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;

                if( node.isRootTag )
                {
                    treeItem.iconPath = icons.getIcon( this._context, node.tag ? node.tag : node.label );
                }
                else if( node.nodes && node.nodes.length > 0 )
                {
                    treeItem.iconPath = vscode.ThemeIcon.Folder;
                }
                else
                {
                    treeItem.iconPath = vscode.ThemeIcon.File;
                }
            }
            else if( node.type === TODO )
            {
                treeItem.iconPath = icons.getIcon( this._context, node.tag ? node.tag : node.label );

                treeItem.command = {
                    command: "todo-tree.revealTodo",
                    title: "",
                    arguments: [
                        node.fsPath,
                        node.line
                    ]
                };
            }
        }

        return treeItem;
    }

    clear( folders )
    {
        utils.resetHashCache();
        nodes = [];

        workspaceFolders = folders;

        if( config.shouldGroup() === false )
        {
            workspaceFolders.map( function( folder )
            {
                nodes.push( createWorkspaceRootNode( folder ) );
            } );
        }
    }

    rebuild()
    {
        utils.resetHashCache();
        buildCounter = ( buildCounter + 1 ) % 100;
    }

    refresh()
    {
        this._onDidChangeTreeData.fire();

        // TODO: Move to extension.js
        // if( setViewVisibility === true )
        // {
        //     vscode.commands.executeCommand( 'setContext', 'todo-tree-has-content', elements.length > 0 );
        // }
    }

    filter( text, children )
    {
        var matcher = new RegExp( text, config.showFilterCaseSensitive() ? "" : "i" );

        if( children === undefined )
        {
            children = nodes;
        }
        children.forEach( child =>
        {
            if( child.type === TODO )
            {
                child.visible = !text || matcher.exec( child.name );
            }
            else
            {
                if( child.nodes !== undefined )
                {
                    this.filter( text, child.nodes );
                }
                if( child.todos !== undefined )
                {
                    this.filter( text, child.todos );
                }
                var visibleNodes = child.nodes ? child.nodes.filter( isVisible ).length : 0;
                var visibleTodos = child.todos ? child.todos.filter( isVisible ).length : 0;
                child.visible = visibleNodes + visibleTodos > 0;
            }
        } );
    }

    clearFilter( children )
    {
        if( children === undefined )
        {
            children = nodes;
        }
        children.forEach( function( child )
        {
            child.visible = true;
            if( child.nodes !== undefined )
            {
                this.clearFilter( child.nodes );
            }
            if( child.todos !== undefined )
            {
                this.clearFilter( child.todos );
            }
        }, this );
    }

    add( result/* , tagRegex */ )
    {
        var rootNode;
        var pathElements = [];

        nodes.map( function( node )
        {
            if( result.file.indexOf( node.fsPath ) === 0 )
            {
                var relativePath = path.relative( node.fsPath, result.file );
                if( relativePath !== "" )
                {
                    pathElements = relativePath.split( path.sep );
                }
                rootNode = node;
            }
        } );

        var todoNode = createTodoNode( result );

        var childNode;

        if( config.shouldFlatten() )
        {
            var findExactPath = function( e )
            {
                return e.type === PATH && e.fsPath === this;
            };

            // if( config.shouldGroup() && todoElement.tag )
            // {
            //     parent = getRootTagElement( todoElement.tag ).elements;
            // }
            // else
            // {
            //     parent = elements;
            // }

            childNode = ( rootNode === undefined ? nodes : rootNode.nodes ).find( findExactPath, result.file );

            if( childNode === undefined )
            {
                childNode = createFlatNode( result.file, rootNode );

                if( rootNode === undefined )
                {
                    nodes.push( childNode );
                }
                else
                {
                    rootNode.nodes.push( childNode );
                }
            }
        }
        else
        {
            var findPathNode = function( node )
            {
                console.log( "node.type:" + node.type + " node.pathElement:" + node.pathElement + " this:" + this );
                return node.type === PATH && node.pathElement === this;
            };

            var parentNode = rootNode;
            pathElements.map( function( element, level )
            {
                console.log( "looking..." );
                childNode = parentNode.nodes.find( findPathNode, element );
                if( childNode === undefined )
                {
                    childNode = createPathNode( rootNode.fsPath, pathElements.slice( 0, level + 1 ) );
                    parentNode.nodes.push( childNode );
                    parentNode = childNode;
                }
                else
                {
                    parentNode = childNode;
                }
            } );
        }

        if( childNode.todos === undefined )
        {
            childNode.todos = [];
        }

        if( childNode.todos.find( function( node )
        {
            return node.name === todoNode.name && node.line === todoNode.line;
        } ) === undefined )
        {
            todoNode.parent = childNode;
            childNode.todos.push( todoNode );
        }
    }

    getElement( filename )
    {
        // var element;

        // var fullPath = path.resolve( rootFolder, filename );
        // var relativePath = path.relative( rootFolder, fullPath );
        // var parts = relativePath.split( path.sep );

        // if( !config.shouldGroup() )
        // {
        //     if( config.shouldFlatten() )
        //     {
        //         var findExactPath = function( e )
        //         {
        //             return e.type === PATH && e.file === this;
        //         };

        //         element = elements.find( findExactPath, fullPath );
        //     }
        //     else
        //     {
        //         var findSubPath = function( e )
        //         {
        //             return e.pathLabel === undefined && e.type === PATH && e.name === this;
        //         };

        //         var parent;

        //         parent = elements;
        //         parts.map( function( p )
        //         {
        //             var child = parent.find( findSubPath, p );
        //             if( child )
        //             {
        //                 element = child;
        //             }
        //             if( element )
        //             {
        //                 parent = element.elements;
        //             }
        //         } );
        //     }
        // }

        // return element && element.file === filename ? element : undefined;
    }
}

exports.TreeNodeProvider = TreeNodeProvider;
