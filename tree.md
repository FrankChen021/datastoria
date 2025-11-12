1. the tree component supports a startLevel parameter (which is based on zero), if it's given, we search from the nodes whose level is greater than the given parameter
   1. for example, if we have a root node 'system', and the startLevel is set to 1, then matching starts from the child nodes of the system. input of 'sys' should not match the root node

2. for a 3 level tree as [system, level1, level2], all are in the collapse mode
   1. if given is 'sys', then we return the 'system' node as matched, and its chilren unchanged, including expanding/collapse state
   2. if given is 'system', the same as above
   3. if given is 'system.', we treat dot separately as a separate of database and table. So we should match node that contains 'system', and then expand nodes under the matched nodes. in this case, we should expand 'system' node to show its two children
   4. if given is 'system.level', as dot is a separator, we should match 'level' directly under the nodes that matches the 'system'. In this case 'level1' is matched. and don't change the expanded state of level1
   5. if given is 'level', the 'level1' and 'level2' will be matched, since they're collapsed, we need to expand to show both of them
3. for nodes expaned by search, users can also click to collapse or expand them


