# add all arguments to an array
array=("$@")
# use the first argument as file_path
file_path="${array[0]}"
# remove file_path from array
array="${array[@]:1}"
# remove old file
sudo rm -rf "${file_path}"
# create new file
sudo touch "${file_path}"
# append contents of array to a text file
echo "${array}" | sudo tee -a "${file_path}"