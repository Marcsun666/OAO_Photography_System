"""Single source of truth for the Feishu Base schema expected by cloud-function/index.js (const F).
Field types (Feishu bitable): 1=text, 2=number, 3=single select, 17=attachment.
The FIRST field of each table becomes its primary field (Feishu does not allow a
single-select primary field, so 外链 uses 标题 first)."""

TXT = lambda n: {"field_name": n, "type": 1}
NUM = lambda n: {"field_name": n, "type": 2, "property": {"formatter": "0"}}
SEL = lambda n, opts: {"field_name": n, "type": 3, "property": {"options": [{"name": o} for o in opts]}}
ATT = lambda n: {"field_name": n, "type": 17}

SPEC = {
    "活动记录": [TXT("活动名称"), TXT("日期"), SEL("组别", ["照片组", "视频组", "两者"]),
              SEL("状态", ["待选片", "精修中", "待交付", "已归档", "待剪辑", "调色中", "待发布", "已发布"]),
              SEL("类型", ["舞台", "运动", "联动", "公益", "招新", "课程", "其他"]), NUM("照片数"), NUM("视频数"),
              TXT("描述"), ATT("封面"), TXT("网盘链接"), TXT("提取码")],
    "照片素材": [TXT("活动"), ATT("文件"), TXT("网盘链接"), TXT("提取码"),
              SEL("分类", ["campus", "sports", "stage", "collab", "landscape"]), TXT("说明")],
    "外链": [TXT("标题"), SEL("平台", ["B站", "小红书", "其他"]), TXT("链接"), TXT("备注")],
    "成员": [TXT("姓名"), TXT("班级"), TXT("学号"), SEL("性别", ["男", "女", "无性别"]), TXT("职位"), TXT("技能"), TXT("备注")],
    "分组": [TXT("批次"), TXT("组名"), TXT("成员"), TXT("技能覆盖"), TXT("说明")],
}

ENV_VAR = {"活动记录": "TABLE_ACTIVITIES", "照片素材": "TABLE_PHOTOS", "外链": "TABLE_LINKS",
           "成员": "TABLE_MEMBERS", "分组": "TABLE_GROUPS"}
