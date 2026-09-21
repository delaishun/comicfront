//日期格式转换
export const date_format = (dataString, lang = "zh-CN") => {
    //dataString是整数，否则要parseInt转换
    var time = new Date(dataString);
    var year = time.getFullYear();
    var month = time.getMonth() + 1;
    var day = time.getDate();
    if (lang == "en") {
        return year + '-' + (month < 10 ? '0' + month : month) + '-' + (day < 10 ? '0' + day : day);
    } else {
        return year + '年' + (month < 10 ? '0' + month : month) + '月' + (day < 10 ? '0' + day : day) + '日';
    }
}


//获得今天日期格式
export const today_format = () => {
    //dataString是整数，否则要parseInt转换
    var time = new Date();
    var year = time.getFullYear();
    var month = time.getMonth() + 1;
    var day = time.getDate();
    return year + '-' + (month < 10 ? '0' + month : month) + '-' + (day < 10 ? '0' + day : day);
}

//返回随机字符串，长度为len
//year为true，则前面加上当前年份
export const random_string = (len, year = false, suff = ".jpg") => {
    let s = ""
    len = len || 32
    let chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'
    let maxPos = chars.length
    let pwd = ''
    for (let i = 0; i < len; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * maxPos))
    }
    if (year) {
        let date = new Date()
        let datestr = date.getYear()
        s = datestr + "" + date.getMonth() + "_" + pwd
    } else {
        s = pwd
    }
    s += suff
    return s
}

//获得一个范围0-n(不包括n)的随机整数
export const random_int = (n)=>{
    return Math.floor(Math.random() * n);
} 

//pic地址减去前缀
export const getcid = (paddr, prefix) => {
    return paddr.replace(prefix)
}

//buffer去掉后面的0  并转为string
const buffer_to_str = (bf) => {
    let index = bf.indexOf(0);
    if (index == 0) return "";
    if (index > 0) {
        let buffer_ = bf.slice(0, index);
        return buffer_.toString()
    } else {
        return bf.toString()
    }
}

//buffer转为各字符串
//data_structs 为数组， 元素: {name:xx, len:xx}
export const buffer_to_data = (bf, data_structs) => {
    let offset = 0
    let data = {}
    for (let i = 0; i < data_structs.length; i++) {
        if (offset, offset + data_structs[i].len > bf.length) break
        let bf_ = bf.slice(offset, offset + data_structs[i].len)
        data[data_structs[i].name] = buffer_to_str(bf_)
        offset += data_structs[i].len;
    }
    return data
}

//将各数据转为buff
//instruction 命令值 0/1/2/...  写在第一个字节
//data_structs与上面函数相同
//strs 字符串数组，与data_structs顺序对应  依次写入buffer
export const data_to_buffer = (instruction, strs = null, data_structs = null) => {
    let buffer_size = 0
    if (data_structs) {
        for (let i = 0; i < data_structs.length; i++)buffer_size += data_structs[i].len;
    }
    console.log("buffer_size:", buffer_size)
    const bf = Buffer.alloc(buffer_size + 1);
    bf.writeUInt8(instruction, 0);
    if (data_structs) {
        let offset = 1;
        for (let i = 0; i < data_structs.length; i++) {
            const bf_ = Buffer.from(strs[i].trim(), "utf8");
            bf_.copy(bf, offset, 0, bf_.length);
            offset += data_structs[i].len;
        }
    }
    return bf;
}


//u64 转 array
// export const u64_to_array = (n) => {
//     let arr = [0,0,0,0,0,0,0,0]
//     for(let i=0;i<8;i++){
//         arr[7-i] = (n >> (i*8)) & 0xff; 
//     }
//     return arr
// }
export function u64_to_array(u64Value_, endianness = 'little') {
    let u64Value = BigInt(0);
    if (typeof u64Value_ !== 'bigint') {
        // throw new Error('Input must be a BigInt representing a u64.')
        u64Value = BigInt(u64Value_);
    } else {
        u64Value = u64Value_
    }

    const byteArray = new Uint8Array(8); // A u64 occupies 8 bytes

    if (endianness === 'little') {
        // Little-endian: Least significant byte first
        for (let i = 0; i < 8; i++) {
            byteArray[i] = Number((u64Value >> BigInt(8 * i)) & 0xFFn);
        }
    } else if (endianness === 'big') {
        // Big-endian: Most significant byte first
        for (let i = 0; i < 8; i++) {
            byteArray[i] = Number((u64Value >> BigInt(8 * (7 - i))) & 0xFFn);
        }
    } else {
        throw new Error('Endianness must be "little" or "big".');
    }

    return byteArray;
}

//是否数字
export function isNumeric(value) {
    return !isNaN(parseFloat(value)) && !isNaN(value);
}

